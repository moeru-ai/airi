# AIRI chat stickers

Twelve static chibi reactions use AIRI's official blue-haired Live2D character.
The images share the cyan hair, angular yellow clip, loop ahoge, sailor collar, and yellow tie.

## Reference and attribution

- [Official DevLog: new Live2D model](https://airi.moeru.ai/docs/en/blog/DevLog-2025.10.20/).
- [Reference video at the reviewed source revision](https://github.com/moeru-ai/airi/blob/87230a0d4f33eefd2b976c41c4a989b0bf1046ce/docs/content/en/blog/DevLog-2025.10.20/assets/airi.mp4). The reference frame is at 00:03.
- [Official repository banner](https://github.com/moeru-ai/airi/blob/87230a0d4f33eefd2b976c41c4a989b0bf1046ce/docs/content/public/banner-light-1280x640.avif), used to cross-check the same character.

Character design attribution remains with Project AIRI, Moeru AI, and their artists.
These generated illustrations are contributed under the repository's MIT license.
This contribution does not redistribute the original Live2D model or reference media.

## Generation

The built-in OpenAI GPT image-generation tool produced one image per emotion on 2026-10-05.
The tool's exact model version is not exposed. No external runtime image service is required.
The happy reaction established the style. Later reactions used that image as a style reference.
Transparent output was requested. The final PNGs retain their generated alpha channels without background replacement.
[Generation manifest](generation.json) records the final prompts, reference roles, image checksums, and review notes.

## Catalog

| File | Name | Emotion tags |
| --- | --- | --- |
| `airi-happy.png` | Happy | happy |
| `airi-sad.png` | Sad | sad |
| `airi-confused.png` | Confused | confused |
| `airi-surprised.png` | Surprised | surprised |
| `airi-thanks.png` | Thank you | thanks, affectionate |
| `airi-celebrate.png` | Celebration | celebrate, happy |
| `airi-angry.png` | Angry | angry |
| `airi-tired.png` | Tired | tired |
| `airi-affectionate.png` | Love | affectionate, happy |
| `airi-awkward.png` | Awkward | awkward |
| `airi-agree.png` | Yes | agree |
| `airi-disagree.png` | No thanks | disagree |

## Inspection

Each image was inspected for matching character features, clear emotion, natural hands, complete hair, and a complete bust silhouette.
Five drafts were regenerated to correct canvas shape or edge cropping.
The selected images are square RGBA PNGs. Their visible artwork stays inside the canvas.
Browser tests decode every catalog image. Settings previews display them at 96 pixels and chat images at 160 pixels.

The previous four development images and their catalog entries are removed.
There is no old-ID migration. Unknown saved IDs retain the translated unavailable placeholder.
