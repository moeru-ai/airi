---
name: unocss-vite-integration
description: Setting up UnoCSS with Vite and framework-specific tips
---

# UnoCSS Vite Integration

The Vite plugin is the most common way to use UnoCSS.

## Installation

```bash
pnpm add -D unocss
```

```ts
// vite.config.ts
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    UnoCSS(),
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

Add to entry:

```ts
// main.ts
import 'virtual:uno.css'
```

## Modes

### global (default)

Standard mode - generates global CSS injected via `uno.css` import.

```ts
import 'virtual:uno.css'
```

### vue-scoped

Injects generated CSS into Vue SFC `<style scoped>`.

```ts
UnoCSS({
  mode: 'vue-scoped',
})
```

### shadow-dom

For Web Components using Shadow DOM:

```ts
UnoCSS({
  mode: 'shadow-dom',
})
```

Add placeholder in component styles:

```ts
const template = document.createElement('template')
template.innerHTML = `
<style>
  :host { ... }
  @unocss-placeholder
</style>
<div class="m-1em">...</div>
`
```

### per-module (experimental)

Generates CSS per module with optional scoping.

### dist-chunk (experimental)

Generates CSS per chunk on build for MPA.

## DevTools Support

Edit classes directly in browser DevTools:

```ts
import 'virtual:uno.css'
import 'virtual:unocss-devtools'
```

**Warning:** Uses MutationObserver to detect changes. Dynamic classes from scripts will also be included.

## Framework-Specific Setup

### React

```ts
// vite.config.ts
import React from '@vitejs/plugin-react'
import UnoCSS from 'unocss/vite'

export default {
  plugins: [
    UnoCSS(), // Must be before React when using attributify
    React(),
  ],
}
```

**Note:** Remove `tsc` from build script if using `@unocss/preset-attributify`.

### Vue

Works out of the box with `@vitejs/plugin-vue`.

### Svelte

```ts
import { svelte } from '@sveltejs/vite-plugin-svelte'
import extractorSvelte from '@unocss/extractor-svelte'
import UnoCSS from 'unocss/vite'

export default {
  plugins: [
    UnoCSS({
      extractors: [extractorSvelte()],
    }),
    svelte(),
  ],
}
```

Supports `class:foo` and `class:foo={bar}` syntax.

### SvelteKit

Same as Svelte, use `sveltekit()` from `@sveltejs/kit/vite`.

### Solid

```ts
import UnoCSS from 'unocss/vite'
import solidPlugin from 'vite-plugin-solid'

export default {
  plugins: [
    UnoCSS(),
    solidPlugin(),
  ],
}
```

### Preact

```ts
import Preact from '@preact/preset-vite'
import UnoCSS from 'unocss/vite'

export default {
  plugins: [
    UnoCSS(),
    Preact(),
  ],
}
```

### Elm

```ts
import Elm from 'vite-plugin-elm'
import UnoCSS from 'unocss/vite'

export default {
  plugins: [
    Elm(),
    UnoCSS(),
  ],
}
```

### Web Components (Lit)

```ts
UnoCSS({
  mode: 'shadow-dom',
  shortcuts: [
    { 'cool-blue': 'bg-blue-500 text-white' },
  ],
})
```

```ts
// my-element.ts
@customElement('my-element')
export class MyElement extends LitElement {
  static styles = css`
    :host { ... }
    @unocss-placeholder
  `
}
```

Supports `part-[<part-name>]:<utility>` for `::part` styling.

## Inspector

Visit `http://localhost:5173/__unocss` in dev mode to:

- Inspect generated CSS rules
- See applied classes per file
- Test utilities in REPL

## Legacy Browser Support

With `@vitejs/plugin-legacy`:

```ts
import legacy from '@vitejs/plugin-legacy'
import UnoCSS from 'unocss/vite'

export default {
  plugins: [
    UnoCSS({
      legacy: {
        renderModernChunks: false,
      },
    }),
    legacy({
      targets: ['defaults', 'not IE 11'],
      renderModernChunks: false,
    }),
  ],
}
```

## VanillaJS / TypeScript

By default, `.js` and `.ts` files are not extracted. Configure to include:

```ts
// uno.config.ts
export default defineConfig({
  content: {
    pipeline: {
      include: [
        /\.(vue|svelte|[jt]sx|html)($|\?)/,
        'src/**/*.{js,ts}',
      ],
    },
  },
})
```

Or use magic comment in files:

```ts
// @unocss-include
export const classes = {
  active: 'bg-primary text-white',
}
```

<!-- 
Source references:
- https://unocss.dev/integrations/vite
-->
