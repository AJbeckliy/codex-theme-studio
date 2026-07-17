const port = Number(process.argv[2] || 9335);
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
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
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result);
});
const result = await new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: {
    expression: `({
      themed: document.documentElement.classList.contains('codex-theme-studio'),
      styledTextNodes: document.querySelectorAll('[data-codex-theme-original-color]').length,
      stylePresent: Boolean(document.getElementById('codex-theme-studio-style'))
    })`, returnByValue: true,
  } }));
});
ws.close();
console.log(JSON.stringify(result.result.value));
if (result.result.value.themed || result.result.value.styledTextNodes || result.result.value.stylePresent) process.exitCode = 2;
