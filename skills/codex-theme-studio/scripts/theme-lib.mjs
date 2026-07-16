import fs from "node:fs/promises";
import path from "node:path";

const REQUIRED_ASSETS = ["hero", "cornerLeft", "cornerRight", "icon"];
const REQUIRED_COLORS = [
  "ink", "muted", "primary", "secondary", "accent", "danger",
  "background", "surface", "line",
];
const REQUIRED_COPY = [
  "brandTitle", "brandSubtitle", "heroSubtitle", "projectLabel", "actionsLabel",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertString(value, label) {
  assert(typeof value === "string" && value.trim(), `${label} must be a non-empty string.`);
}

function resolveAsset(themePath, relativePath, label) {
  assertString(relativePath, label);
  assert(!path.isAbsolute(relativePath), `${label} must be relative to the theme folder.`);
  const resolved = path.resolve(themePath, relativePath);
  const prefix = `${path.resolve(themePath)}${path.sep}`.toLowerCase();
  assert(resolved.toLowerCase().startsWith(prefix), `${label} cannot leave the theme folder.`);
  return resolved;
}

export function validateTheme(theme, themePath) {
  assert(theme && typeof theme === "object" && !Array.isArray(theme), "theme.json must contain an object.");
  assert(theme.schemaVersion === 1, "schemaVersion must be 1.");
  assertString(theme.id, "id");
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(theme.id), "id must be a lowercase kebab-case slug.");
  assertString(theme.displayName, "displayName");
  assertString(theme.version, "version");
  assert(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(theme.version), "version must use semantic version format.");

  assert(theme.rights && typeof theme.rights === "object", "rights is required.");
  assert(["original", "licensed", "personal-ip", "private-reference"].includes(theme.rights.mode),
    "rights.mode must be original, licensed, personal-ip, or private-reference.");
  assert(theme.rights.reviewed === true, "rights.reviewed must be true before installation.");
  assertString(theme.rights.notes, "rights.notes");

  assert(theme.copy && typeof theme.copy === "object", "copy is required.");
  for (const key of REQUIRED_COPY) assertString(theme.copy[key], `copy.${key}`);

  assert(theme.palette && typeof theme.palette === "object", "palette is required.");
  for (const key of REQUIRED_COLORS) {
    assert(/^#[0-9a-fA-F]{6}$/.test(theme.palette[key] || ""), `palette.${key} must be a six-digit hex color.`);
  }

  assert(theme.layout && typeof theme.layout === "object", "layout is required.");
  assertString(theme.layout.heroPosition, "layout.heroPosition");
  if (theme.layout.heroHeight !== undefined) {
    assert(Number.isInteger(theme.layout.heroHeight) && theme.layout.heroHeight >= 220 && theme.layout.heroHeight <= 560,
      "layout.heroHeight must be an integer from 220 to 560.");
  }
  if (theme.layout.heroSize !== undefined) {
    assert(["cover", "contain"].includes(theme.layout.heroSize), "layout.heroSize must be cover or contain.");
  }

  assert(theme.assets && typeof theme.assets === "object", "assets is required.");
  const files = {};
  for (const key of REQUIRED_ASSETS) files[key] = resolveAsset(themePath, theme.assets[key], `assets.${key}`);
  if (theme.assets.shortcutIcon) files.shortcutIcon = resolveAsset(themePath, theme.assets.shortcutIcon, "assets.shortcutIcon");

  assert(Array.isArray(theme.homeActions) && theme.homeActions.length >= 1 && theme.homeActions.length <= 4,
    "homeActions must contain one to four actions.");
  for (const [index, action] of theme.homeActions.entries()) {
    for (const key of ["title", "detail", "prompt", "iconSource"]) {
      assertString(action?.[key], `homeActions[${index}].${key}`);
    }
  }
  return files;
}

export async function loadTheme(inputPath) {
  const themePath = path.resolve(inputPath);
  const stat = await fs.stat(themePath).catch(() => null);
  assert(stat?.isDirectory(), `Theme folder not found: ${themePath}`);
  const manifestPath = path.join(themePath, "theme.json");
  const theme = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const files = validateTheme(theme, themePath);
  for (const [label, filePath] of Object.entries(files)) {
    const fileStat = await fs.stat(filePath).catch(() => null);
    assert(fileStat?.isFile(), `Theme ${label} asset not found: ${filePath}`);
  }
  return { themePath, manifestPath, theme, files };
}

export function toDataUrl(filePath, bytes) {
  const mime = ({
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  })[path.extname(filePath).toLowerCase()];
  assert(mime, `Unsupported image type: ${filePath}`);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
