import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTheme, toDataUrl } from "./theme-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function parseArgs(argv) {
  const options = { port: 9335, mode: "watch", timeoutMs: 30000, screenshot: null, reload: false, theme: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") options.port = Number(argv[++i]);
    else if (arg === "--theme") options.theme = path.resolve(argv[++i]);
    else if (arg === "--once") options.mode = "once";
    else if (arg === "--watch") options.mode = "watch";
    else if (arg === "--verify") options.mode = "verify";
    else if (arg === "--remove") options.mode = "remove";
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++i]);
    else if (arg === "--screenshot") options.screenshot = path.resolve(argv[++i]);
    else if (arg === "--reload") options.reload = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) throw new Error(`Invalid port: ${options.port}`);
  if (options.mode !== "remove" && !options.theme) throw new Error("--theme <folder> is required.");
  return options;
}

class CdpSession {
  constructor(target) {
    this.target = target;
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => this.onMessage(event));
    this.ws.addEventListener("close", () => {
      this.closed = true;
      for (const waiter of this.pending.values()) waiter.reject(new Error("CDP socket closed"));
      this.pending.clear();
    });
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    return this;
  }
  onMessage(event) {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${message.error.message} (${message.error.code})`));
      else waiter.resolve(message.result);
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
  }
  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }
  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error("CDP session is closed"));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: false });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`Renderer evaluation failed: ${detail}`);
    }
    return result.result?.value;
  }
  close() { if (!this.closed) this.ws.close(); this.closed = true; }
}

async function waitForTargets(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const targets = (await response.json()).filter((item) => item.type === "page" && item.url.startsWith("app://"));
      if (targets.length) return targets;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`No Codex renderer target on 127.0.0.1:${port}: ${lastError?.message ?? "timed out"}`);
}

async function loadPayload(themePath) {
  const loaded = await loadTheme(themePath);
  const [css, template, hero, cornerLeft, cornerRight, icon] = await Promise.all([
    fs.readFile(path.join(root, "assets", "base-theme.css"), "utf8"),
    fs.readFile(path.join(root, "assets", "renderer-inject.js"), "utf8"),
    fs.readFile(loaded.files.hero), fs.readFile(loaded.files.cornerLeft),
    fs.readFile(loaded.files.cornerRight), fs.readFile(loaded.files.icon),
  ]);
  return {
    loaded,
    payload: template
      .replace("__THEME_CSS_JSON__", JSON.stringify(css))
      .replace("__THEME_JSON__", JSON.stringify(loaded.theme))
      .replace("__THEME_HERO_JSON__", JSON.stringify(toDataUrl(loaded.files.hero, hero)))
      .replace("__THEME_CORNER_LEFT_JSON__", JSON.stringify(toDataUrl(loaded.files.cornerLeft, cornerLeft)))
      .replace("__THEME_CORNER_RIGHT_JSON__", JSON.stringify(toDataUrl(loaded.files.cornerRight, cornerRight)))
      .replace("__THEME_ICON_JSON__", JSON.stringify(toDataUrl(loaded.files.icon, icon))),
  };
}

async function connectTarget(target) { return new CdpSession(target).open(); }

async function removeFromSession(session) {
  return session.evaluate(`(() => {
    window.__CODEX_THEME_STUDIO_DISABLED__ = true;
    const state = window.__CODEX_THEME_STUDIO_STATE__;
    if (state?.cleanup) return state.cleanup();
    const root = document.documentElement;
    root?.classList.remove('codex-theme-studio');
    for (const name of [...root?.style || []].filter((name) => name.startsWith('--theme-'))) root.style.removeProperty(name);
    document.getElementById('codex-theme-studio-style')?.remove();
    document.getElementById('codex-theme-chrome')?.remove();
    document.getElementById('theme-home-actions')?.remove();
    return true;
  })()`);
}

async function verifySession(session) {
  return session.evaluate(`(() => {
    const box = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    };
    const home = document.querySelector('.theme-home');
    const suggestions = home?.querySelector('.group\\\\/home-suggestions, #theme-home-actions') ?? null;
    const cards = suggestions ? [...suggestions.querySelectorAll('button')].map(box) : [];
    const chrome = document.getElementById('codex-theme-chrome');
    const result = {
      installed: document.documentElement.classList.contains('codex-theme-studio'),
      version: window.__CODEX_THEME_STUDIO_STATE__?.version ?? null,
      stylePresent: Boolean(document.getElementById('codex-theme-studio-style')),
      chromePresent: Boolean(chrome),
      chromePointerEvents: getComputedStyle(chrome || document.body).pointerEvents,
      homePresent: Boolean(home), suggestionsPresent: Boolean(suggestions),
      hero: box(home?.firstElementChild?.firstElementChild?.firstElementChild), cards,
      composer: box(document.querySelector('.composer-surface-chrome')),
      sidebar: box(document.querySelector('aside.app-shell-left-panel')),
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow: { x: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight > document.documentElement.clientHeight },
    };
    result.pass = result.installed && result.stylePresent && result.chromePresent && result.chromePointerEvents === 'none' &&
      Boolean(result.composer) && Boolean(result.sidebar) && (!result.homePresent || (Boolean(result.hero) &&
        (!result.suggestionsPresent || (result.cards.length >= 1 && result.cards.length <= 4))));
    return result;
  })()`);
}

async function waitForVerifiedSession(session, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastResult;
  while (Date.now() < deadline) {
    lastResult = await verifySession(session);
    if (lastResult.pass) return lastResult;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return lastResult;
}

async function capture(session, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await session.evaluate("document.activeElement?.blur()");
  const result = await session.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  await fs.writeFile(outputPath, Buffer.from(result.data, "base64"));
}

async function runOneShot(options) {
  const targets = await waitForTargets(options.port, options.timeoutMs);
  const prepared = (options.mode === "once" || options.reload) ? await loadPayload(options.theme) : null;
  const results = [];
  for (const target of targets) {
    const session = await connectTarget(target);
    try {
      if (options.mode === "remove") await removeFromSession(session);
      else if (options.mode === "once") await session.evaluate(prepared.payload);
      if (options.reload) {
        await session.send("Page.reload", { ignoreCache: true });
        await new Promise((resolve) => setTimeout(resolve, 1600));
        if (options.mode !== "remove") await session.evaluate(prepared.payload);
      }
      const verified = options.mode === "remove"
        ? await session.evaluate("!document.documentElement.classList.contains('codex-theme-studio')")
        : (options.reload || options.mode === "once") ? await waitForVerifiedSession(session, options.timeoutMs) : await verifySession(session);
      results.push({ targetId: target.id, title: target.title, url: target.url, result: verified });
      if (options.screenshot) await capture(session, options.screenshot);
    } finally { session.close(); }
  }
  console.log(JSON.stringify({ mode: options.mode, port: options.port, theme: prepared?.loaded.theme.id ?? options.theme, targets: results }, null, 2));
  if (options.mode === "verify" && results.some((item) => !item.result.pass)) process.exitCode = 2;
}

async function runWatch(options) {
  const prepared = await loadPayload(options.theme);
  const sessions = new Map();
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  while (!stopping) {
    let targets = [];
    try { targets = await waitForTargets(options.port, 2000); }
    catch (error) {
      console.error(`[theme-studio] ${new Date().toISOString()} ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    const activeIds = new Set(targets.map((target) => target.id));
    for (const [id, session] of sessions) {
      if (!activeIds.has(id) || session.closed) { session.close(); sessions.delete(id); }
    }
    for (const target of targets) {
      if (sessions.has(target.id)) continue;
      try {
        const session = await connectTarget(target);
        session.on("Page.loadEventFired", () => setTimeout(() => session.evaluate(prepared.payload).catch((error) => {
          console.error(`[theme-studio] reinject failed: ${error.message}`);
        }), 250));
        await session.evaluate(prepared.payload);
        sessions.set(target.id, session);
        console.log(`[theme-studio] injected ${prepared.loaded.theme.id} into ${target.id}`);
      } catch (error) { console.error(`[theme-studio] inject failed for ${target.id}: ${error.message}`); }
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
  for (const session of sessions.values()) session.close();
}

const options = parseArgs(process.argv.slice(2));
if (options.mode === "watch") await runWatch(options);
else await runOneShot(options);
