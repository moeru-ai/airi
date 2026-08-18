---
name: preset-rem-to-px
description: Convert rem units to px for utilities
---

# Preset Rem to Px

Converts `rem` units to `px` in generated utilities.

## Installation

```ts
import { defineConfig, presetRemToPx, presetWind3 } from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(),
    presetRemToPx(),
  ],
})
```

## What It Does

Transforms all rem values to px:

```html
<div class="p-4">
```

Without preset:
```css
.p-4 { padding: 1rem; }
```

With preset:
```css
.p-4 { padding: 16px; }
```

## Use Cases

- Projects requiring pixel-perfect designs
- Environments where rem doesn't work well
- Consistency with pixel-based design systems
- Email templates (better compatibility)

## Options

```ts
presetRemToPx({
  // Base font size for conversion (default: 16)
  baseFontSize: 16,
})
```

Custom base:

```ts
presetRemToPx({
  baseFontSize: 14, // 1rem = 14px
})
```

## With Preset Wind4

**Note:** `presetRemToPx` is not needed with `preset-wind4`. Use the built-in processor instead:

```ts
import { createRemToPxProcessor } from '@unocss/preset-wind4/utils'

export default defineConfig({
  presets: [
    presetWind4({
      preflights: {
        theme: {
          process: createRemToPxProcessor(),
        }
      },
    }),
  ],
  // Also apply to utilities
  postprocess: [createRemToPxProcessor()],
})
```

## Important Notes

- Order matters: place after the preset that generates rem values
- Affects all utilities with rem units
- Theme values in rem are also converted

<!-- 
Source references:
- https://unocss.dev/presets/rem-to-px
- https://unocss.dev/presets/wind4
-->
