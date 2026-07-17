import fs from "node:fs/promises";
import path from "node:path";

const port = Number(process.argv[2] || 9335);
const output = path.resolve(process.argv[3] || "qa/theme-home.png");
let targets;
for (const endpoint of ["127.0.0.1", "[::1]", "localhost"]) {
  try {
    const response = await fetch(`http://${endpoint}:${port}/json/list`, { signal: AbortSignal.timeout(1000) });
    if (response.ok) { targets = await response.json(); break; }
  } catch {}
}
if (!targets) throw new Error(`Codex CDP endpoint not found on port ${port}.`);
const target = targets.find((item) => item.type === "page" && item.url.startsWith("app://"));
if (!target) throw new Error("Codex page target not found.");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});
let nextId = 1;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  if (!message.id || !pending.has(message.id)) return;
  const waiter = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message));
  else waiter.resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result?.value;
};
await send("Runtime.enable");
await send("Page.enable");
const clicked = await evaluate(`(() => {
  if (document.querySelector('.theme-home')) return { clicked: true, alreadyHome: true };
  const button = document.querySelector('[data-testid="home-icon"]')?.closest('button, [role="button"]') ||
    [...document.querySelectorAll('button')].find((node) => node.innerText?.includes('Ctrl+N'));
  if (!button) return { clicked: false, labels: [...document.querySelectorAll('button')].map((node) => node.innerText?.trim()).filter(Boolean).slice(0, 20) };
  button.click();
  return { clicked: true, label: button.innerText.trim() };
})()`);
if (!clicked.clicked) throw new Error(`Home button not found: ${JSON.stringify(clicked.labels)}`);
await new Promise((resolve) => setTimeout(resolve, 700));
let state;
for (let attempt = 0; attempt < 30; attempt += 1) {
state = await evaluate(`(() => {
  const box = (node) => { const r = node?.getBoundingClientRect(); return r && { x: r.x, y: r.y, width: r.width, height: r.height }; };
  const home = document.querySelector('.theme-home');
  const hero = home?.firstElementChild?.firstElementChild?.firstElementChild;
  const actions = document.getElementById('theme-home-actions');
  const cards = actions ? [...actions.querySelectorAll('button')].map(box) : [];
  const labels = actions ? [...actions.querySelectorAll('strong')].map((node) => node.textContent) : [];
  return {
    homePresent: Boolean(home), hero: box(hero), actionsPresent: Boolean(actions), cards, labels,
    iconsWithSvg: actions ? actions.querySelectorAll('.theme-home-action-icon svg').length : 0,
    version: window.__CODEX_THEME_STUDIO_STATE__?.version,
    expectedActionCount: window.__CODEX_THEME_STUDIO_STATE__?.theme?.homeActions?.length ?? 0,
    overflow: { x: document.documentElement.scrollWidth > document.documentElement.clientWidth, y: document.documentElement.scrollHeight > document.documentElement.clientHeight },
    viewport: { width: innerWidth, height: innerHeight },
  };
})()`);
  if (state.homePresent && state.actionsPresent && state.cards.length === state.expectedActionCount) break;
  await new Promise((resolve) => setTimeout(resolve, 300));
}
const actionFill = await evaluate(`(() => {
  const action = document.querySelector('#theme-home-actions button');
  const editor = document.querySelector('.ProseMirror[contenteditable="true"]');
  if (!action || !editor) return { pass: false, reason: 'action or editor missing' };
  const expected = window.__CODEX_THEME_STUDIO_STATE__?.theme?.homeActions?.[0]?.prompt;
  action.click();
  const inserted = editor.innerText.trim();
  const paragraph = document.createElement('p');
  editor.replaceChildren(paragraph);
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContent' }));
  return { pass: Boolean(expected) && inserted === expected, inserted, expected };
})()`);
await fs.mkdir(path.dirname(output), { recursive: true });
const screenshot = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
await fs.writeFile(output, Buffer.from(screenshot.data, "base64"));
ws.close();
console.log(JSON.stringify({ clicked, state, actionFill, screenshot: output }, null, 2));
if (!state.homePresent || !state.actionsPresent || state.cards.length !== state.expectedActionCount || state.overflow.x || !actionFill.pass) process.exitCode = 2;
