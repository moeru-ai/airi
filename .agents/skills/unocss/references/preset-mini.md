---
name: preset-mini
description: Minimal preset with essential utilities for UnoCSS
---

# Preset Mini

The minimal preset with only essential rules and variants. Good starting point for custom presets.

## Installation

```ts
import { defineConfig, presetMini } from 'unocss'

export default defineConfig({
  presets: [
    presetMini(),
  ],
})
```

## What's Included

Subset of `preset-wind3` with essential utilities aligned to CSS properties:

- Basic spacing (margin, padding)
- Display (flex, grid, block, etc.)
- Positioning (absolute, relative, fixed)
- Sizing (width, height)
- Colors (text, background, border)
- Typography basics (font-size, font-weight)
- Borders and border-radius
- Basic transforms and transitions

## What's NOT Included

Opinionated or complex Tailwind utilities:
- `container`
- Complex animations
- Gradients
- Advanced typography
- Prose classes

## Use Cases

1. **Building custom presets** - Start with mini and add only what you need
2. **Minimal bundle size** - When you only need basic utilities
3. **Learning** - Understand UnoCSS core without Tailwind complexity

## Dark Mode

Same as preset-wind3:

```ts
presetMini({
  dark: 'class' // or 'media'
})
```

```html
<div class="dark:bg-red:10" />
```

Class-based:
```css
.dark .dark\:bg-red\:10 {
  background-color: rgb(248 113 113 / 0.1);
}
```

Media query:
```css
@media (prefers-color-scheme: dark) {
  .dark\:bg-red\:10 {
    background-color: rgb(248 113 113 / 0.1);
  }
}
```

## CSS @layer Variant

Native CSS layer support:

```html
<div class="layer-foo:p4" />
```

```css
@layer foo {
  .layer-foo\:p4 {
    padding: 1rem;
  }
}
```

## Theme Customization

```ts
presetMini({
  theme: {
    colors: {
      veryCool: '#0000ff',
      brand: {
        primary: 'hsl(var(--hue, 217) 78% 51%)',
      }
    },
  }
})
```

**Note:** `breakpoints` property is overridden, not merged.

## Options

```ts
presetMini({
  // Dark mode: 'class' | 'media' | { light: string, dark: string }
  dark: 'class',
  
  // Generate [group=""] instead of .group for attributify
  attributifyPseudo: false,
  
  // CSS variable prefix (default: 'un-')
  variablePrefix: 'un-',
  
  // Utility prefix
  prefix: undefined,
  
  // Preflight generation: true | false | 'on-demand'
  preflight: true,
})
```

## Building on Mini

Create custom preset extending mini:

```ts
import { presetMini } from 'unocss'
import type { Preset } from 'unocss'

export const myPreset: Preset = {
  name: 'my-preset',
  presets: [presetMini()],
  rules: [
    // Add custom rules
    ['card', { 'border-radius': '8px', 'box-shadow': '0 2px 8px rgba(0,0,0,0.1)' }],
  ],
  shortcuts: {
    'btn': 'px-4 py-2 rounded bg-blue-500 text-white',
  },
}
```

<!-- 
Source references:
- https://unocss.dev/presets/mini
-->
