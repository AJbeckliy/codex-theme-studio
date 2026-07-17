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

export function validateThemeStylesheet(cssText) {
  assert(typeof cssText === "string", "theme.css must be UTF-8 text.");
  assert(Buffer.byteLength(cssText, "utf8") <= 64 * 1024, "theme.css must not exceed 64 KB.");
  assert(!cssText.includes("\0"), "theme.css cannot contain null bytes.");
  assert(!/@import\b|url\s*\(|expression\s*\(|behavior\s*:|-moz-binding\s*:/i.test(cssText),
    "theme.css cannot import or load external resources; use the supplied --theme-* variables.");
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
    for (const key of ["title", "detail", "prompt"]) {
      assertString(action?.[key], `homeActions[${index}].${key}`);
    }
    if (action?.iconSource !== undefined) assertString(action.iconSource, `homeActions[${index}].iconSource`);
  }
  return files;
}

function inspectPng(bytes, label) {
  const signature = "89504e470d0a1a0a";
  assert(bytes.length >= 33 && bytes.subarray(0, 8).toString("hex") === signature, `${label} must be a valid PNG file.`);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const colorType = bytes[25];
  let transparent = colorType === 4 || colorType === 6;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "tRNS") transparent = true;
    offset += length + 12;
  }
  return { width, height, transparent };
}

export async function loadTheme(inputPath) {
  const themePath = await fs.realpath(path.resolve(inputPath)).catch(() => null);
  assert(themePath, `Theme folder not found: ${path.resolve(inputPath)}`);
  const stat = await fs.stat(themePath).catch(() => null);
  assert(stat?.isDirectory(), `Theme folder not found: ${themePath}`);
  const manifestPath = path.join(themePath, "theme.json");
  const theme = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const files = validateTheme(theme, themePath);
  const stylesheetPath = path.join(themePath, "theme.css");
  const stylesheetEntry = await fs.lstat(stylesheetPath).catch(() => null);
  if (stylesheetEntry) {
    const realPath = await fs.realpath(stylesheetPath).catch(() => null);
    const prefix = `${themePath}${path.sep}`.toLowerCase();
    assert(realPath?.toLowerCase().startsWith(prefix), "theme.css cannot leave the theme folder.");
    const fileStat = await fs.stat(realPath).catch(() => null);
    assert(fileStat?.isFile(), `Theme stylesheet not found: ${stylesheetPath}`);
    assert(fileStat.size <= 64 * 1024, "theme.css must not exceed 64 KB.");
    validateThemeStylesheet(await fs.readFile(realPath, "utf8"));
    files.stylesheet = realPath;
  }
  for (const [label, filePath] of Object.entries(files)) {
    const realPath = await fs.realpath(filePath).catch(() => null);
    const prefix = `${themePath}${path.sep}`.toLowerCase();
    assert(realPath?.toLowerCase().startsWith(prefix), `Theme ${label} asset cannot leave the theme folder.`);
    const fileStat = await fs.stat(realPath).catch(() => null);
    assert(fileStat?.isFile(), `Theme ${label} asset not found: ${filePath}`);
    files[label] = realPath;
  }
  for (const label of REQUIRED_ASSETS) {
    const bytes = await fs.readFile(files[label]);
    const info = inspectPng(bytes, `Theme ${label} asset`);
    if (label === "hero") assert(info.width / info.height >= 1.8, "Theme hero asset must be a wide image with at least a 1.8:1 ratio.");
    if (label === "icon") assert(info.width === info.height && info.width >= 256, "Theme icon asset must be square and at least 256x256.");
    if (label === "cornerLeft" || label === "cornerRight") assert(info.transparent, `Theme ${label} asset must contain transparency.`);
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
