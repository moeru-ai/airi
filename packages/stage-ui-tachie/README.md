# `@proj-airi/stage-ui-tachie`

Tachie scene rendering for characters represented by a small set of complete,
static emotion images.

## What it does

- Loads `.tachie.zip` archives from local files, blob URLs, or HTTP(S) URLs.
- Selects images through AIRI's shared emotion vocabulary.
- Renders the active image with PixiJS on a transparent, responsive canvas.
- Persists scale, position, render scale, and theme-colored shadow settings.
- Exposes canvas capture for stage screenshots and theme-color extraction.

## Archive format

`neutral` is required. Every other image is optional, and missing emotions fall
back to `neutral`. File extensions are not part of the protocol; image content
only needs to be decodable by the browser.

```text
character.tachie.zip
├── neutral.png
├── happy.webp
└── surprised.jpg
```

A single wrapping directory is also accepted:

```text
character.tachie.zip
└── character/
    ├── neutral.png
    └── happy.webp
```

Supported names are `neutral`, `happy`, `sad`, `angry`, `think`, `surprised`,
`awkward`, `question`, and `curious`. Matching is case-insensitive. Every
recognized image must use the same pixel dimensions.

## How to use

```vue
<script setup lang="ts">
import { TachieScene } from '@proj-airi/stage-ui-tachie'
</script>

<template>
  <TachieScene :model-src="modelUrl" />
</template>
```

## When to use it

Use Tachie for low-asset characters whose visual state can be represented by
one complete image per emotion.

Do not use it for layered sprites, rigged animation, lip-sync, or parameterized
eye and body tracking. Use Live2D, Spine, VRM, or MMD for those models.
