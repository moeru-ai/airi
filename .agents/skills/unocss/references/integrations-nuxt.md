---
name: unocss-nuxt-integration
description: UnoCSS module for Nuxt applications
---

# UnoCSS Nuxt Integration

The official Nuxt module for UnoCSS.

## Installation

```bash
pnpm add -D unocss @unocss/nuxt
```

Add to Nuxt config:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: [
    '@unocss/nuxt',
  ],
})
```

Create config file:

```ts
// uno.config.ts
import { defineConfig, presetWind3 } from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(),
  ],
})
```

**Note:** The `uno.css` entry is automatically injected by the module.

## Support Status

| Build Tool | Nuxt 2 | Nuxt Bridge | Nuxt 3 |
|------------|--------|-------------|--------|
| Webpack Dev | ✅ | ✅ | 🚧 |
| Webpack Build | ✅ | ✅ | ✅ |
| Vite Dev | - | ✅ | ✅ |
| Vite Build | - | ✅ | ✅ |

## Configuration

### Using uno.config.ts (Recommended)

Use a dedicated config file for best IDE support:

```ts
// uno.config.ts
import { defineConfig, presetWind3, presetIcons } from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(),
    presetIcons(),
  ],
  shortcuts: {
    'btn': 'py-2 px-4 font-semibold rounded-lg',
  },
})
```

### Nuxt Layers Support

Enable automatic config merging from Nuxt layers:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  unocss: {
    nuxtLayers: true,
  },
})
```

Then in your root config:

```ts
// uno.config.ts
import config from './.nuxt/uno.config.mjs'

export default config
```

Or extend the merged config:

```ts
// uno.config.ts
import { mergeConfigs } from '@unocss/core'
import config from './.nuxt/uno.config.mjs'

export default mergeConfigs([config, {
  // Your overrides
  shortcuts: {
    'custom': 'text-red-500',
  },
}])
```

## Common Setup Example

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: [
    '@unocss/nuxt',
  ],
})
```

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
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
    }),
    presetTypography(),
    presetWebFonts({
      fonts: {
        sans: 'DM Sans',
        mono: 'DM Mono',
      },
    }),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
  shortcuts: [
    ['btn', 'px-4 py-1 rounded inline-block bg-teal-600 text-white cursor-pointer hover:bg-teal-700 disabled:cursor-default disabled:bg-gray-600 disabled:opacity-50'],
  ],
})
```

## Usage in Components

```vue
<template>
  <div class="p-4 text-center">
    <h1 class="text-3xl font-bold text-blue-600">
      Hello UnoCSS!
    </h1>
    <button class="btn mt-4">
      Click me
    </button>
  </div>
</template>
```

With attributify mode:

```vue
<template>
  <div p="4" text="center">
    <h1 text="3xl blue-600" font="bold">
      Hello UnoCSS!
    </h1>
  </div>
</template>
```

## Inspector

In development, visit `/_nuxt/__unocss` to access the UnoCSS inspector.

## Key Differences from Vite

- No need to import `virtual:uno.css` - automatically injected
- Config file discovery works the same
- All Vite plugin features available
- Nuxt layers config merging available

<!-- 
Source references:
- https://unocss.dev/integrations/nuxt
-->
