---
name: preset-wind4
description: Tailwind CSS v4 compatible preset with enhanced features
---

# Preset Wind4

The Tailwind CSS v4 compatible preset. Enhances preset-wind3 with modern CSS features.

## Installation

```ts
import { defineConfig, presetWind4 } from 'unocss'

export default defineConfig({
  presets: [
    presetWind4(),
  ],
})
```

## Key Differences from Wind3

### Built-in CSS Reset

No need for `@unocss/reset` - reset is built-in:

```ts
// Remove these imports
import '@unocss/reset/tailwind.css' // ❌ Not needed
import '@unocss/reset/tailwind-compat.css' // ❌ Not needed

// Enable in config
presetWind4({
  preflights: {
    reset: true,
  },
})
```

### OKLCH Color Model

Uses `oklch` for better color perception and contrast. Not compatible with `presetLegacyCompat`.

### Theme CSS Variables

Automatically generates CSS variables from theme:

```css
:root, :host {
  --spacing: 0.25rem;
  --font-sans: ui-sans-serif, system-ui, sans-serif;
  --colors-black: #000;
  --colors-white: #fff;
  /* ... */
}
```

### @property CSS Rules

Uses `@property` for better browser optimization:

```css
@property --un-text-opacity {
  syntax: '<percentage>';
  inherits: false;
  initial-value: 100%;
}
```

### Theme Key Changes

| preset-wind3 | preset-wind4 |
|--------------|--------------|
| `fontFamily` | `font` |
| `fontSize` | `text.fontSize` |
| `lineHeight` | `text.lineHeight` or `leading` |
| `letterSpacing` | `text.letterSpacing` or `tracking` |
| `borderRadius` | `radius` |
| `easing` | `ease` |
| `breakpoints` | `breakpoint` |
| `verticalBreakpoints` | `verticalBreakpoint` |
| `boxShadow` | `shadow` |
| `transitionProperty` | `property` |
| `container.maxWidth` | `containers.maxWidth` |
| Size properties (`width`, `height`, etc.) | Unified to `spacing` |

## Options

```ts
presetWind4({
  preflights: {
    // Built-in reset styles
    reset: true,
    
    // Theme CSS variables generation
    theme: 'on-demand', // true | false | 'on-demand'
    
    // @property CSS rules
    property: true,
  },
})
```

### Theme Variable Processing

Convert rem to px for theme variables:

```ts
import { createRemToPxProcessor } from '@unocss/preset-wind4/utils'

presetWind4({
  preflights: {
    theme: {
      mode: 'on-demand',
      process: createRemToPxProcessor(),
    }
  },
})

// Also apply to utilities
export default defineConfig({
  postprocess: [createRemToPxProcessor()],
})
```

### Property Layer Customization

```ts
presetWind4({
  preflights: {
    property: {
      // Custom parent wrapper
      parent: '@layer custom-properties',
      // Custom selector
      selector: ':where(*, ::before, ::after)',
    },
  },
})
```

Remove `@supports` wrapper:

```ts
presetWind4({
  preflights: {
    property: {
      parent: false,
    },
  },
})
```

## Generated Layers

| Layer | Description | Order |
|-------|-------------|-------|
| `properties` | CSS `@property` rules | -200 |
| `theme` | Theme CSS variables | -150 |
| `base` | Reset/preflight styles | -100 |

## Theme.defaults

Global default configuration for reset styles:

```ts
import type { Theme } from '@unocss/preset-wind4/theme'

const defaults: Theme['default'] = {
  transition: {
    duration: '150ms',
    timingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  font: {
    family: 'var(--font-sans)',
    featureSettings: 'var(--font-sans--font-feature-settings)',
    variationSettings: 'var(--font-sans--font-variation-settings)',
  },
  monoFont: {
    family: 'var(--font-mono)',
    // ...
  },
}
```

## Compatibility Notes

### presetRemToPx

Not needed - use built-in processor instead:

```ts
presetWind4({
  preflights: {
    theme: {
      process: createRemToPxProcessor(),
    }
  },
})
```

### presetLegacyCompat

**Not compatible** with preset-wind4 due to `oklch` color model.

## Migration from Wind3

1. Update theme keys according to the table above
2. Remove `@unocss/reset` imports
3. Enable `preflights.reset: true`
4. Test color outputs (oklch vs rgb)
5. Update any custom theme extensions

```ts
// Before (wind3)
theme: {
  fontFamily: { sans: 'Roboto' },
  fontSize: { lg: '1.125rem' },
  breakpoints: { sm: '640px' },
}

// After (wind4)
theme: {
  font: { sans: 'Roboto' },
  text: { lg: { fontSize: '1.125rem' } },
  breakpoint: { sm: '640px' },
}
```

## When to Use Wind4

Choose **preset-wind4** when:
- Starting a new project
- Targeting modern browsers
- Want built-in reset and CSS variables
- Following Tailwind v4 conventions

Choose **preset-wind3** when:
- Need legacy browser support
- Migrating from Tailwind v3
- Using presetLegacyCompat
- Want stable, proven preset

<!-- 
Source references:
- https://unocss.dev/presets/wind4
-->
