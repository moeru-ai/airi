---
name: preset-web-fonts
description: Easy Google Fonts and other web fonts integration
---

# Preset Web Fonts

Easily use web fonts from Google Fonts and other providers.

## Installation

```ts
import { defineConfig, presetWebFonts, presetWind3 } from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(),
    presetWebFonts({
      provider: 'google',
      fonts: {
        sans: 'Roboto',
        mono: 'Fira Code',
      },
    }),
  ],
})
```

## Providers

- `google` - Google Fonts (default)
- `bunny` - Privacy-friendly alternative
- `fontshare` - Quality fonts by ITF
- `fontsource` - Self-hosted open source fonts
- `coollabs` - Privacy-friendly drop-in replacement
- `none` - Treat as system font

## Font Configuration

```ts
fonts: {
  // Simple
  sans: 'Roboto',
  
  // Multiple (fallback)
  mono: ['Fira Code', 'Fira Mono:400,700'],
  
  // Detailed
  lato: [
    {
      name: 'Lato',
      weights: ['400', '700'],
      italic: true,
    },
    {
      name: 'sans-serif',
      provider: 'none',
    },
  ],
}
```

## Usage

```html
<p class="font-sans">Roboto</p>
<code class="font-mono">Fira Code</code>
```

## Local Fonts

Self-host fonts:

```ts
import { createLocalFontProcessor } from '@unocss/preset-web-fonts/local'

presetWebFonts({
  provider: 'none',
  fonts: { sans: 'Roboto' },
  processors: createLocalFontProcessor({
    cacheDir: 'node_modules/.cache/unocss/fonts',
    fontAssetsDir: 'public/assets/fonts',
    fontServeBaseUrl: '/assets/fonts',
  })
})
```

<!-- 
Source references:
- https://unocss.dev/presets/web-fonts
-->
