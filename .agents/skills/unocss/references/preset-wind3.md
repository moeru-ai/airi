---
name: preset-wind3
description: Tailwind CSS / Windi CSS compatible preset for UnoCSS
---

# Preset Wind3

The Tailwind CSS / Windi CSS compatible preset. Most commonly used preset for UnoCSS.

## Installation

```ts
import { defineConfig, presetWind3 } from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(),
  ],
})
```

**Note:** `@unocss/preset-uno` and `@unocss/preset-wind` are deprecated and renamed to `@unocss/preset-wind3`.

## Features

- Full Tailwind CSS v3 compatibility
- Dark mode (`dark:`, `@dark:`)
- All responsive variants (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`)
- All standard utilities (flex, grid, spacing, colors, typography, etc.)
- Animation support (includes Animate.css animations)

## Dark Mode

### Class-based (default)

```html
<div class="dark:bg-gray-800">
```

Generates: `.dark .dark\:bg-gray-800 { ... }`

### Media Query Based

```ts
presetWind3({
  dark: 'media'
})
```

Generates: `@media (prefers-color-scheme: dark) { ... }`

### Opt-in Media Query

Use `@dark:` regardless of config:

```html
<div class="@dark:bg-gray-800">
```

## Options

```ts
presetWind3({
  // Dark mode strategy
  dark: 'class', // 'class' | 'media' | { light: '.light', dark: '.dark' }
  
  // Generate pseudo selector as [group=""] instead of .group
  attributifyPseudo: false,
  
  // CSS custom properties prefix
  variablePrefix: 'un-',
  
  // Utils prefix
  prefix: '',
  
  // Generate preflight CSS
  preflight: true, // true | false | 'on-demand'
  
  // Mark all utilities as !important
  important: false, // boolean | string (selector)
})
```

### Important Option

Make all utilities `!important`:

```ts
presetWind3({
  important: true,
})
```

Or scope with selector to increase specificity without `!important`:

```ts
presetWind3({
  important: '#app',
})
```

Output: `#app :is(.dark .dark\:bg-blue) { ... }`

## Differences from Tailwind CSS

### Quotes Not Supported

Template quotes don't work due to extractor:

```html
<!-- Won't work -->
<div class="before:content-['']">

<!-- Use shortcut instead -->
<div class="before:content-empty">
```

### Background Position

Use `position:` prefix for custom values:

```html
<!-- Tailwind -->
<div class="bg-[center_top_1rem]">

<!-- UnoCSS -->
<div class="bg-[position:center_top_1rem]">
```

### Animations

UnoCSS integrates Animate.css. Use `-alt` suffix for Animate.css versions when names conflict:

- `animate-bounce` - Tailwind version
- `animate-bounce-alt` - Animate.css version

Custom animations:

```ts
theme: {
  animation: {
    keyframes: {
      custom: '{0%, 100% { opacity: 0; } 50% { opacity: 1; }}',
    },
    durations: {
      custom: '1s',
    },
    timingFns: {
      custom: 'ease-in-out',
    },
    counts: {
      custom: 'infinite',
    },
  }
}
```

## Differences from Windi CSS

| Windi CSS | UnoCSS |
|-----------|--------|
| `<sm:p-1` | `lt-sm:p-1` |
| `@lg:p-1` | `at-lg:p-1` |
| `>xl:p-1` | `xl:p-1` |

Bracket syntax uses `_` instead of `,`:

```html
<!-- Windi CSS -->
<div class="grid-cols-[1fr,10px,max-content]">

<!-- UnoCSS -->
<div class="grid-cols-[1fr_10px_max-content]">
```

## Experimental: Media Hover

Addresses sticky hover on touch devices:

```html
<div class="@hover-text-red">
```

Generates:
```css
@media (hover: hover) and (pointer: fine) {
  .\@hover-text-red:hover { ... }
}
```

<!-- 
Source references:
- https://unocss.dev/presets/wind3
-->
