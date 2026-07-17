# GPT Image asset workflow

Generate four required assets so each can be revised without redrawing the entire theme. Generate a fifth chat background only when the requested design uses full-window chat artwork.

## Hero

Request a cinematic 16:9 or wider illustration with the subject concentrated on the right, calm negative space on the left, no text, no logo, and no UI frame. Crop to a wide banner after generation when needed.

## Chat background

Do not reuse a panoramic hero when it leaves a horizontal band or requires stretching. Measure the visible chat surface from the user's screenshot or CDP capture, then generate or outpaint a dedicated `chat-background.png` at that ratio. Use about 1.07:1 only when no better measurement exists.

Keep the subject inside the right third, reserve the left 55–60% as a quiet text-safe region, and keep important details outside the outer 5% crop margin. Extend the scene naturally above and below; do not mirror, blur-fill, or reproduce the Codex UI. Request clean full-strength artwork without text, UI, overlays, or baked-in transparency. The theme CSS supplies readability gradients and opacity.

Use this prompt structure:

```text
Outpaint the supplied hero into a dedicated Codex chat background at [measured ratio].
Preserve the subject's identity, pose, clothing, lighting, and scene style.
Keep the subject in the right third and reserve the left 55–60% for readable dark text.
Extend the environment naturally above and below with no stretching, seams, duplication, UI, text, logos, or watermarks.
Keep important content outside the outer 5% crop-safe margin.
Output clean full-strength artwork suitable for CSS background-size: cover.
```

## Icon

Request one bold centered emblem, flat or lightly dimensional, on a simple square background. Avoid thin lines and tiny details because Windows also renders it at 16×16.

## Corners

Generate left and right decorations separately on a pure chroma-key background not used in the artwork. Use the image generation skill's `remove_chroma_key.py` utility, then inspect the alpha edge before copying into the theme folder.

## Naming and copy

Keep words, headings, and action prompts in `theme.json`. Raster assets should contain no text unless the theme explicitly requires ornamental lettering and the result has been visually inspected.

## QA

- Hero focal point remains visible after a panoramic crop.
- Left-side hero text has sufficient quiet space.
- Chat background matches the measured surface ratio, fills it with `cover`, and does not become a horizontal band.
- Chat subject remains inside the crop-safe area while the left text region stays calm and readable after overlays.
- Transparent corners do not have white or chroma halos.
- Icon remains legible at 16×16, 32×32, and 48×48.
- No unintended marks, signatures, watermarks, or misspelled text appear.
