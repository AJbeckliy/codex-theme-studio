import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { loadTheme, validateTheme, validateThemeStylesheet } from "../skills/codex-theme-studio/scripts/theme-lib.mjs";

const examples = path.resolve(process.argv[2] || "examples");
const baseCss = await fs.readFile(new URL("../skills/codex-theme-studio/assets/base-theme.css", import.meta.url), "utf8");
const renderer = await fs.readFile(new URL("../skills/codex-theme-studio/assets/renderer-inject.js", import.meta.url), "utf8");
const folders = (await fs.readdir(examples, { withFileTypes: true })).filter((entry) => entry.isDirectory());
assert(folders.length, "No example themes found.");

for (const folder of folders) {
  const loaded = await loadTheme(path.join(examples, folder.name));
  const withoutIconSource = structuredClone(loaded.theme);
  delete withoutIconSource.homeActions[0].iconSource;
  assert.doesNotThrow(() => validateTheme(withoutIconSource, loaded.themePath));

  const withChatBackground = structuredClone(loaded.theme);
  withChatBackground.assets.chatBackground = withChatBackground.assets.hero;
  const files = validateTheme(withChatBackground, loaded.themePath);
  assert.equal(files.chatBackground, files.hero);
}

assert.doesNotThrow(() => validateThemeStylesheet("html.codex-theme-studio { opacity: .9; }"));
assert.throws(() => validateThemeStylesheet("@import 'https://example.com/theme.css';"));
assert.throws(() => validateThemeStylesheet("html { background: url(https://example.com/a.png); }"));
for (const token of ["text-token-foreground", "text-token-conversation", "text-token-description-foreground", "text-token-text-tertiary", "loading-shimmer"]) {
  assert(baseCss.includes(token), `Shared CSS must theme ${token}.`);
  assert(renderer.includes(token), `Renderer must enforce ${token} against app-level important styles.`);
}
assert(renderer.includes('setProperty("color", color, "important")'), "Renderer must enforce semantic text colors with inline important priority.");

console.log(`Validated ${folders.length} theme packages, semantic text colors, optional chat backgrounds, iconSource, and theme.css safety.`);
