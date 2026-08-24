---
name: unocss-configuration
description: Config file setup and all configuration options for UnoCSS
---

# UnoCSS Configuration

UnoCSS is configured via a dedicated config file in your project root.

## Config File

**Recommended:** Use a dedicated `uno.config.ts` file for best IDE support and HMR.

```ts
// uno.config.ts
import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  presetWebFonts,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup
} from 'unocss'

export default defineConfig({
  shortcuts: [
    // ...
  ],
  theme: {
    colors: {
      // ...
    }
  },
  presets: [
    presetWind3(),
    presetAttributify(),
    presetIcons(),
    presetTypography(),
    presetWebFonts({
      fonts: {
        // ...
      },
    }),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
})
```

UnoCSS automatically looks for `uno.config.{js,ts,mjs,mts}` or `unocss.config.{js,ts,mjs,mts}` in the project root.

## Key Configuration Options

### rules
Define CSS utility rules. Later entries have higher priority.

```ts
rules: [
  ['m-1', { margin: '0.25rem' }],
  [/^m-(\d+)$/, ([, d]) => ({ margin: `${d / 4}rem` })],
]
```

### shortcuts
Combine multiple rules into a single shorthand.

```ts
shortcuts: {
  'btn': 'py-2 px-4 font-semibold rounded-lg shadow-md',
}
```

### theme
Theme object for design tokens shared between rules.

```ts
theme: {
  colors: {
    brand: '#942192',
  },
  breakpoints: {
    sm: '640px',
    md: '768px',
  },
}
```

### presets
Predefined configurations bundling rules, variants, and themes.

```ts
presets: [
  presetWind3(),
  presetIcons(),
]
```

### transformers
Transform source code to support special syntax.

```ts
transformers: [
  transformerDirectives(),
  transformerVariantGroup(),
]
```

### variants
Preprocess selectors with ability to rewrite CSS output.

### extractors
Handle source files and extract utility class names.

### preflights
Inject raw CSS globally.

### layers
Control the order of CSS layers. Default is `0`.

```ts
layers: {
  'components': -1,
  'default': 1,
  'utilities': 2,
}
```

### safelist
Utilities that are always included in output.

```ts
safelist: ['p-1', 'p-2', 'p-3']
```

### blocklist
Utilities that are always excluded.

```ts
blocklist: ['p-1', /^p-[2-4]$/]
```

### content
Configure where to extract utilities from.

```ts
content: {
  pipeline: {
    include: [/\.(vue|svelte|tsx|html)($|\?)/],
  },
  filesystem: ['src/**/*.php'],
}
```

### separators
Variant separator characters. Default: `[':', '-']`

### outputToCssLayers
Output UnoCSS layers as CSS Cascade Layers.

```ts
outputToCssLayers: true
```

## Specifying Config File Location

```ts
// vite.config.ts
import UnoCSS from 'unocss/vite'

export default defineConfig({
  plugins: [
    UnoCSS({
      configFile: '../my-uno.config.ts',
    }),
  ],
})
```

<!-- 
Source references:
- https://unocss.dev/guide/config-file
- https://unocss.dev/config/
-->
