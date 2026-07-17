const port = Number(process.argv[2] || 9335);
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
await send("Runtime.enable");
const response = await send("Runtime.evaluate", {
  expression: `(() => {
    const parse = (value) => value?.match(/[\\d.]+/g)?.map(Number) || [];
    const luminance = (value) => {
      const channels = parse(value).slice(0, 3).map((channel) => channel / 255)
        .map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
      return channels.length === 3 ? .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2] : null;
    };
    const directText = (node) => [...node.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE)
      .map((child) => child.textContent).join(' ').replace(/\\s+/g, ' ').trim();
    const selector = '[class~="text-token-foreground"]:not([class*="git-decoration"]), [class*="text-token-conversation"], [class*="text-token-description-foreground"], [class*="text-token-text-tertiary"], [class*="loading-shimmer"]';
    const nodes = [...document.querySelectorAll('main.main-surface *')].flatMap((node) => {
      const text = directText(node);
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      if (!text || rect.width < 2 || rect.height < 2 || rect.bottom <= 0 || rect.top >= innerHeight ||
          style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < .1) return [];
      const colorLuminance = luminance(style.color);
      return [{
        tag: node.tagName.toLowerCase(), text: text.slice(0, 120), className: String(node.className).slice(0, 220),
        color: style.color, colorLuminance, backgroundColor: style.backgroundColor,
        matchesSemanticSelector: node.matches(selector),
        box: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
        suspect: colorLuminance !== null && colorLuminance < .35,
      }];
    }).sort((a, b) => Number(b.suspect) - Number(a.suspect) || a.box.y - b.box.y);
    const styleText = document.getElementById('codex-theme-studio-style')?.textContent || '';
    return { styleHasSemanticRule: styleText.includes('text-token-conversation'), nodes };
  })()`,
  returnByValue: true,
});
if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
ws.close();
console.log(JSON.stringify(response.result.value, null, 2));
