import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { loadTheme, validateTheme, validateThemeStylesheet } from "../skills/codex-theme-studio/scripts/theme-lib.mjs";

const examples = path.resolve(process.argv[2] || "examples");
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

console.log(`Validated ${folders.length} theme packages, optional chat backgrounds, iconSource, and theme.css safety.`);
