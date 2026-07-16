import { loadTheme } from "./theme-lib.mjs";

const index = process.argv.indexOf("--theme");
if (index < 0 || !process.argv[index + 1]) throw new Error("Usage: node validate-theme.mjs --theme <folder>");
const loaded = await loadTheme(process.argv[index + 1]);
console.log(JSON.stringify({
  valid: true,
  id: loaded.theme.id,
  displayName: loaded.theme.displayName,
  version: loaded.theme.version,
  rightsMode: loaded.theme.rights.mode,
  path: loaded.themePath,
}, null, 2));
