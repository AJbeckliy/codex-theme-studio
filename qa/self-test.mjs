import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { loadTheme, validateTheme } from "../skills/codex-theme-studio/scripts/theme-lib.mjs";

const examples = path.resolve(process.argv[2] || "examples");
const folders = (await fs.readdir(examples, { withFileTypes: true })).filter((entry) => entry.isDirectory());
assert(folders.length, "No example themes found.");

for (const folder of folders) {
  const loaded = await loadTheme(path.join(examples, folder.name));
  const withoutIconSource = structuredClone(loaded.theme);
  delete withoutIconSource.homeActions[0].iconSource;
  assert.doesNotThrow(() => validateTheme(withoutIconSource, loaded.themePath));
}

console.log(`Validated ${folders.length} theme packages and optional iconSource handling.`);
