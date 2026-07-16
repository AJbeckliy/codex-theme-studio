---
name: codex-theme-studio
description: Create, package, install, test, switch, and restore reusable visual themes for the Windows Codex desktop app. Use when a user asks to skin Codex, turn a reference image into a theme, generate theme art with GPT Image, configure compact or immersive hero banners, theme the composer colors, create theme-specific desktop shortcut icons, validate a theme package, or publish a reusable Codex theme workflow to GitHub.
---

# Codex Theme Studio

Build themes as data and image packages while reusing the supplied Windows launcher and CDP injection engine.

## Workflow

1. Confirm the target is the Windows Store Codex desktop app.
2. Inspect the requested visual direction and choose a rights mode from `references/rights-modes.md`.
3. Create a theme folder from the schema in `references/theme-package.md`.
4. Choose a compact or immersive hero layout and composer palette using `references/theme-package.md`.
5. Generate or prepare four raster assets: hero, left corner, right corner, and square icon.
6. Run `node scripts/validate-theme.mjs --theme <theme-folder>`.
7. Run `powershell -ExecutionPolicy Bypass -File scripts/install-theme.ps1 -ThemePath <theme-folder>`.
8. Launch the created desktop shortcut or run `scripts/start-theme.ps1` directly.
9. Verify the live app with `scripts/verify-theme.ps1`, including a screenshot when visual QA is needed.
10. Test `scripts/restore-theme.ps1`, then reapply the theme if the user wants it left active.

## Image generation

Use the built-in image generation capability by default. Read `references/image-generation.md` before generating assets. Keep all UI text in the manifest; generated images should normally contain no text.

For transparent corner decorations, generate each asset on a flat chroma-key background, remove that color, and inspect the PNG edges. Do not fake transparency with white backgrounds.

## Theme packaging

Keep every theme self-contained:

```text
my-theme/
├── theme.json
├── hero.png
├── corner-left.png
├── corner-right.png
├── icon.png
└── icon.ico          # generated during installation when absent
```

Do not edit `assets/base-theme.css` for ordinary themes. Change it only when adding a capability that every theme package should inherit.

## Install and switch

Install or update the Codex light chrome palette and create themed shortcuts:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-theme.ps1 -ThemePath "C:\path\to\my-theme"
```

Start or switch themes on the existing debug-enabled Codex session:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-theme.ps1 -ThemePath "C:\path\to\my-theme"
```

If Codex is already open without the debug port, close it first. Use `-RestartExisting` only after the user has saved current work and authorized restarting the app.

## Verify and recover

Run structural verification and capture the current window:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify-theme.ps1 `
  -ThemePath "C:\path\to\my-theme" `
  -Screenshot "C:\path\to\qa.png"
```

Always verify:

- The home hero and one to four action cards fit the viewport.
- Immersive hero cards remain inside the background area and the composer starts below it.
- The chat view retains readable contrast and usable composer controls.
- Composer background, border, text, caret, and send button follow the theme palette.
- The desktop shortcut uses the theme `.ico`, not the PowerShell icon.
- Restore removes the live injection.
- Reapplying the same theme is idempotent.

Remove the live theme without changing the saved Codex palette:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/restore-theme.ps1
```

Add `-RestoreBaseTheme` to restore the pre-install Codex palette backup. Add `-Uninstall -ThemePath <folder>` to remove shortcuts for one theme. Never delete the theme folder automatically.

## Failure handling

- If the validator fails, fix the manifest or missing assets before touching Codex.
- If the debug port is unavailable, do not launch the WindowsApps executable directly; use `start-theme.ps1`.
- If verification fails, inspect `%LOCALAPPDATA%\CodexThemeStudio\injector-error.log`.
- If a Codex update changes the DOM, keep the theme package unchanged and repair only the shared renderer/CSS engine.
- Preserve the original config backup at `%LOCALAPPDATA%\CodexThemeStudio\config.before-theme-studio.toml`.
