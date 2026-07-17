import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTheme, toDataUrl } from "./theme-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function parseArgs(argv) {
  const options = { port: 9335, mode: "watch", timeoutMs: 30000, screenshot: null, reload: false, theme: null, view: "current" };
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
    else if (arg === "--view") options.view = argv[++i]?.toLowerCase();
    else if (arg === "--reload") options.reload = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) throw new Error(`Invalid port: ${options.port}`);
  if (!["current", "home", "chat"].includes(options.view)) throw new Error(`Invalid view: ${options.view}`);
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
  const endpoints = ["127.0.0.1", "[::1]", "localhost"];
  while (Date.now() < deadline) {
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`http://${endpoint}:${port}/json/list`, { signal: AbortSignal.timeout(1000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const targets = (await response.json()).filter((item) => item.type === "page" && item.url.startsWith("app://"));
        if (targets.length) return targets;
      } catch (error) { lastError = error; }
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`No Codex renderer target on port ${port}: ${lastError?.message ?? "timed out"}`);
}

async function loadPayload(themePath) {
  const loaded = await loadTheme(themePath);
  const [baseCss, themeCss, template, hero, cornerLeft, cornerRight, icon] = await Promise.all([
    fs.readFile(path.join(root, "assets", "base-theme.css"), "utf8"),
    loaded.files.stylesheet ? fs.readFile(loaded.files.stylesheet, "utf8") : "",
    fs.readFile(path.join(root, "assets", "renderer-inject.js"), "utf8"),
    fs.readFile(loaded.files.hero), fs.readFile(loaded.files.cornerLeft),
    fs.readFile(loaded.files.cornerRight), fs.readFile(loaded.files.icon),
  ]);
  const css = themeCss ? `${baseCss}\n\n/* Theme overrides */\n${themeCss}` : baseCss;
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

async function verifySession(session, expectedView = "current", expectedVersion = null, expectedActionCount = null, immersive = false) {
  return session.evaluate(`(() => {
    const box = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    };
    const home = document.querySelector('.theme-home');
    const suggestions = home?.querySelector('#theme-home-actions') ?? null;
    const cards = suggestions ? [...suggestions.querySelectorAll('button')].map(box) : [];
    const chrome = document.getElementById('codex-theme-chrome');
    const state = window.__CODEX_THEME_STUDIO_STATE__;
    const luminance = (hex) => {
      const channels = hex.slice(1).match(/../g).map((value) => parseInt(value, 16) / 255)
        .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
    };
    const contrast = (left, right) => {
      const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
      return Math.round(((values[0] + .05) / (values[1] + .05)) * 100) / 100;
    };
    const rgbToHex = (value) => {
      const channels = value?.match(/[\\d.]+/g)?.map(Number);
      if (!channels || channels.length < 3) return null;
      return '#' + channels.slice(0, 3).map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('');
    };
    const backgroundFor = (node, fallback) => {
      for (let current = node; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.backgroundImage !== 'none') return fallback;
        const value = style.backgroundColor;
        const channels = value?.match(/[\\d.]+/g)?.map(Number);
        if (channels && (channels.length < 4 || channels[3] > 0)) return rgbToHex(value);
      }
      return fallback;
    };
    const palette = state?.theme?.palette;
    const contrasts = palette ? {
      inkSurface: contrast(palette.ink, palette.surface),
      inkBackground: contrast(palette.ink, palette.background),
      mutedBackground: contrast(palette.muted, palette.background),
    } : null;
    const runtimeBackground = getComputedStyle(document.documentElement).getPropertyValue('--theme-background').trim();
    const computedContrasts = [
      ['sidebar', document.querySelector('aside.app-shell-left-panel button'), null],
      ['composer', document.querySelector('.ProseMirror[contenteditable="true"]'), null],
      ['content', home?.querySelector('#theme-home-actions strong') || document.querySelector('main.main-surface p'), runtimeBackground],
    ].flatMap(([name, node, backgroundHint]) => {
      const foreground = node && rgbToHex(getComputedStyle(node).color);
      const background = node && (backgroundHint || backgroundFor(node, palette?.background));
      return foreground && background ? [{ name, ratio: contrast(foreground, background), foreground, background }] : [];
    });
    const result = {
      installed: document.documentElement.classList.contains('codex-theme-studio'),
      version: state?.version ?? null,
      expectedVersion: ${JSON.stringify(expectedVersion)},
      expectedActionCount: ${JSON.stringify(expectedActionCount)},
      immersive: ${JSON.stringify(immersive)},
      requestedView: ${JSON.stringify(expectedView)},
      detectedView: home ? 'home' : 'chat',
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
      contrasts,
      computedContrasts,
    };
    const rgbaAlpha = (value) => {
      const channels = value?.match(/[\\d.]+/g)?.map(Number);
      return channels?.length >= 4 ? channels[3] : 1;
    };
    const chatSurface = document.querySelector('main.main-surface');
    const contentViewport = document.querySelector('.app-shell-main-content-viewport');
    const cornerNodes = [...document.querySelectorAll('#codex-theme-chrome:not(.theme-home-shell) .theme-corner')];
    const cornerVisibility = cornerNodes.map((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const opacity = Number(style.opacity);
      const intersectsViewport = rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
      return { display: style.display, opacity, intersectsViewport, box: box(node) };
    });
    const contentViewportStyle = getComputedStyle(contentViewport || document.body);
    result.chatVisual = {
      backgroundHasThemeImage: getComputedStyle(chatSurface || document.body).backgroundImage.includes('blob:'),
      contentViewportBackground: contentViewportStyle.background,
      contentViewportBackgroundColor: contentViewportStyle.backgroundColor,
      contentViewportBackgroundAlpha: rgbaAlpha(contentViewportStyle.backgroundColor),
      corners: cornerVisibility,
      visibleCornerCount: cornerVisibility.filter((item) => item.display !== 'none' && item.opacity >= .12 && item.intersectsViewport).length,
    };
    const inViewport = (item) => item && item.x >= 0 && item.y >= 0 &&
      item.x + item.width <= result.viewport.width + 1 && item.y + item.height <= result.viewport.height + 1;
    const commonPass = result.installed && result.stylePresent && result.chromePresent &&
      result.chromePointerEvents === 'none' && Boolean(result.composer) && Boolean(result.sidebar) &&
      !result.documentOverflow.x && (!result.expectedVersion || result.version === result.expectedVersion);
    const contrastPass = Boolean(contrasts) && contrasts.inkSurface >= 4.5 &&
      contrasts.inkBackground >= 4.5 && contrasts.mutedBackground >= 3;
    const computedContrastPass = computedContrasts.length >= 2 && computedContrasts.every((item) => item.ratio >= 4.5);
    const contains = (outer, inner) => outer && inner && inner.x >= outer.x - 1 && inner.y >= outer.y - 1 &&
      inner.x + inner.width <= outer.x + outer.width + 1 && inner.y + inner.height <= outer.y + outer.height + 1;
    const lastCardBottom = result.cards.length ? Math.max(...result.cards.map((card) => card.y + card.height)) : 0;
    result.homePass = result.homePresent && Boolean(result.hero) && result.suggestionsPresent &&
      result.cards.length === result.expectedActionCount && inViewport(result.hero) && result.cards.every(inViewport) &&
      (!result.immersive || result.cards.every((card) => contains(result.hero, card))) && (result.composer?.y ?? -Infinity) + 1 >= lastCardBottom;
    result.chatPass = !result.homePresent && inViewport(result.composer) &&
      result.chatVisual.backgroundHasThemeImage && result.chatVisual.contentViewportBackgroundAlpha <= .2 &&
      result.chatVisual.visibleCornerCount >= 1;
    const viewPass = result.requestedView === 'current' || result.requestedView === result.detectedView;
    result.pass = commonPass && contrastPass && computedContrastPass && viewPass &&
      (result.detectedView === 'home' ? result.homePass : result.chatPass);
    return result;
  })()`);
}

async function waitForVerifiedSession(session, timeoutMs, expectedView, expectedVersion, expectedActionCount, immersive) {
  const deadline = Date.now() + timeoutMs;
  let lastResult;
  while (Date.now() < deadline) {
    lastResult = await verifySession(session, expectedView, expectedVersion, expectedActionCount, immersive);
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
  const expectedTheme = options.mode === "verify" ? await loadTheme(options.theme) : prepared?.loaded;
  const expectedVersion = expectedTheme ? `${expectedTheme.theme.id}@${expectedTheme.theme.version}` : null;
  const expectedActionCount = expectedTheme?.theme.homeActions.length ?? null;
  const immersive = (expectedTheme?.theme.layout.heroHeight ?? 252) >= 360;
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
        : (options.reload || options.mode === "once")
          ? await waitForVerifiedSession(session, options.timeoutMs, options.view, expectedVersion, expectedActionCount, immersive)
          : await verifySession(session, options.view, expectedVersion, expectedActionCount, immersive);
      results.push({ targetId: target.id, title: target.title, url: target.url, result: verified });
      if (options.screenshot) await capture(session, options.screenshot);
    } finally { session.close(); }
  }
  console.log(JSON.stringify({ mode: options.mode, view: options.view, port: options.port, theme: expectedTheme?.theme.id ?? options.theme, targets: results }, null, 2));
  if (options.mode === "verify" && results.some((item) => !item.result.pass)) process.exitCode = 2;
  if (options.mode === "remove" && results.some((item) => item.result !== true)) process.exitCode = 2;
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
