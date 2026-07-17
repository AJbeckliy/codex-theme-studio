# Theme package schema

Use UTF-8 JSON. Paths are relative to the folder containing `theme.json` and cannot leave that folder.

An optional UTF-8 `theme.css` in the same folder loads after the shared stylesheet.

```json
{
  "schemaVersion": 1,
  "id": "my-original-theme",
  "displayName": "My Original Theme",
  "version": "1.0.0",
  "rights": {
    "mode": "original",
    "reviewed": true,
    "notes": "Original art with no third-party marks or likenesses."
  },
  "copy": {
    "brandTitle": "MY THEME",
    "brandSubtitle": "A focused Codex workspace",
    "heroSubtitle": "Turn ideas into working software",
    "projectLabel": "Choose a project",
    "actionsLabel": "Theme shortcuts"
  },
  "palette": {
    "ink": "#17385F",
    "muted": "#6F7E91",
    "primary": "#F7D93D",
    "secondary": "#4B9EEA",
    "accent": "#D4AF37",
    "danger": "#E84545",
    "background": "#FFF9E8",
    "surface": "#FFFDF7",
    "line": "#CAB57A"
  },
  "layout": {
    "heroPosition": "right center",
    "heroHeight": 500,
    "heroSize": "cover"
  },
  "assets": {
    "hero": "hero.png",
    "cornerLeft": "corner-left.png",
    "cornerRight": "corner-right.png",
    "icon": "icon.png",
    "shortcutIcon": "icon.ico"
  },
  "homeActions": [
    {
      "title": "Create a project",
      "detail": "Start with a clear goal",
      "prompt": "Help me create a new project.",
      "iconSource": "新建任务"
    }
  ]
}
```

Rules:

- `id`: lowercase kebab-case.
- `version`: semantic version.
- `rights.reviewed`: must be `true` before installation.
- `rights.mode`: `original`, `licensed`, `personal-ip`, or non-distributable `private-reference`.
- Palette entries: six-digit hex colors.
- `homeActions`: one to four items. `iconSource` should match a visible Codex sidebar label; absence only removes the small SVG, not the action.
- `hero`: wide art with focal content on the right and negative space on the left.
- `cornerLeft` and `cornerRight`: transparent PNG.
- `icon`: square PNG at least 256×256; 1024×1024 recommended.
- `shortcutIcon`: optional during creation. The installer builds a multi-size `.ico` from `icon` when missing.
- `theme.css`: optional per-theme overrides for chat backgrounds, decoration placement, opacity, and similarly specific visual treatment. Keep selectors under `html.codex-theme-studio`, use the existing `--theme-*` variables, and do not use `@import`, `url()`, or other external-resource loading.

## Hero layout

Use the compact default by omitting `heroHeight` and `heroSize`; it renders at 252px with the action cards below the banner.

Use an immersive background when the reference design places the action cards inside a large image:

```json
"layout": {
  "heroPosition": "right center",
  "heroHeight": 500,
  "heroSize": "cover"
}
```

- `heroHeight`: integer from 220 to 560. Start at 480–500 for a desktop background containing the cards.
- `heroSize`: `cover` fills the background; `contain` preserves the whole image.
- `heroPosition`: standard CSS background position. Keep portrait subjects on the right and text-safe negative space on the left.
- Windows narrower than 900px use the compact responsive layout.

Verify that the cards end before the hero background ends, the composer begins below the hero, and the document has no horizontal overflow.

## Composer palette

The composer and project selector automatically use the manifest palette; do not add theme-specific CSS for ordinary color changes.

- `surface` and `background`: composer base gradient.
- `primary`: composer tint and send-button base.
- `accent`: send-button highlight blend.
- `line`: composer and project-selector border.
- `ink`: input and label text.
- `danger`: text caret and existing warning accents.

Check both the home and chat composer because the same palette is applied to both views.
