import fs from "node:fs/promises";
import path from "node:path";

const port = Number(process.argv[2] || 9335);
const output = path.resolve(process.argv[3] || "qa/theme-chat.png");
const chatLabel = process.argv[4] || null;
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
  const waiter = pending.get(message.id); pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result?.value;
};
await send("Runtime.enable"); await send("Page.enable");
const clicked = chatLabel ? await evaluate(`(() => {
  const candidates = [...document.querySelectorAll('aside button, aside [role="button"]')];
  const target = candidates.find((node) => node.innerText?.includes(${JSON.stringify(chatLabel)}) && node.getBoundingClientRect().width > 0);
  if (!target) return { clicked: false, labels: candidates.map((node) => node.innerText?.trim()).filter(Boolean).slice(0, 30) };
  const rect = target.getBoundingClientRect();
  return { clicked: true, label: target.innerText.trim(), x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
})()`) : null;
if (chatLabel && !clicked.clicked) throw new Error(`Chat target not found: ${JSON.stringify(clicked.labels)}`);
if (clicked?.clicked) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: clicked.x, y: clicked.y, button: "none" });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: clicked.x, y: clicked.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: clicked.x, y: clicked.y, button: "left", clickCount: 1 });
}
await new Promise((resolve) => setTimeout(resolve, 1800));
const state = await evaluate(`(() => {
  const chrome = document.getElementById('codex-theme-chrome');
  const brand = chrome?.querySelector('.theme-brand');
  const left = chrome?.querySelector('.theme-corner-left');
  const right = chrome?.querySelector('.theme-corner-right');
  const composer = document.querySelector('.composer-surface-chrome');
  return {
    homePresent: Boolean(document.querySelector('.theme-home')),
    brandText: brand?.innerText,
    brandVisible: brand ? getComputedStyle(brand).display !== 'none' : false,
    leftVisible: left ? getComputedStyle(left).display !== 'none' : false,
    rightVisible: right ? getComputedStyle(right).display !== 'none' : false,
    composerPresent: Boolean(composer),
    version: window.__CODEX_THEME_STUDIO_STATE__?.version,
    overflow: { x: document.documentElement.scrollWidth > document.documentElement.clientWidth, y: document.documentElement.scrollHeight > document.documentElement.clientHeight },
  };
})()`);
await fs.mkdir(path.dirname(output), { recursive: true });
const screenshot = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
await fs.writeFile(output, Buffer.from(screenshot.data, "base64"));
ws.close();
console.log(JSON.stringify({ clicked, state, screenshot: output }, null, 2));
if (state.homePresent || !state.brandVisible || !state.leftVisible || !state.rightVisible || !state.composerPresent || state.overflow.x) process.exitCode = 2;
