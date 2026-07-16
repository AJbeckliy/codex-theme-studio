# GPT Image asset workflow

Generate four separate assets so each can be revised without redrawing the entire theme.

## Hero

Request a cinematic 16:9 or wider illustration with the subject concentrated on the right, calm negative space on the left, no text, no logo, and no UI frame. Crop to a wide banner after generation when needed.

## Icon

Request one bold centered emblem, flat or lightly dimensional, on a simple square background. Avoid thin lines and tiny details because Windows also renders it at 16×16.

## Corners

Generate left and right decorations separately on a pure chroma-key background not used in the artwork. Use the image generation skill's `remove_chroma_key.py` utility, then inspect the alpha edge before copying into the theme folder.

## Naming and copy

Keep words, headings, and action prompts in `theme.json`. Raster assets should contain no text unless the theme explicitly requires ornamental lettering and the result has been visually inspected.

## QA

- Hero focal point remains visible after a panoramic crop.
- Left-side hero text has sufficient quiet space.
- Transparent corners do not have white or chroma halos.
- Icon remains legible at 16×16, 32×32, and 48×48.
- No unintended marks, signatures, watermarks, or misspelled text appear.
