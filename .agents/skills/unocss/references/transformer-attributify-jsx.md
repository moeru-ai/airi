---
name: transformer-attributify-jsx
description: Support valueless attributify in JSX/TSX
---

# Transformer Attributify JSX

Fixes valueless attributify mode in JSX where `<div foo>` becomes `<div foo={true}>`.

## The Problem

In JSX, valueless attributes are transformed:

```jsx
// You write
<div m-2 rounded text-teal-400 />

// JSX compiles to
<div m-2={true} rounded={true} text-teal-400={true} />
```

The `={true}` breaks UnoCSS attributify detection.

## Installation

```ts
import { 
  defineConfig, 
  presetAttributify, 
  transformerAttributifyJsx 
} from 'unocss'

export default defineConfig({
  presets: [
    presetAttributify(),
  ],
  transformers: [
    transformerAttributifyJsx(),
  ],
})
```

## How It Works

The transformer converts JSX boolean attributes back to strings:

```jsx
// Input (after JSX compilation)
<div m-2={true} rounded={true} />

// Output (transformed)
<div m-2="" rounded="" />
```

Now UnoCSS can properly extract the attributify classes.

## Options

```ts
transformerAttributifyJsx({
  // Only transform specific attributes
  // Default: transforms all that match attributify patterns
  blocklist: ['text', 'font'],
})
```

## When to Use

Required when using:
- React
- Preact
- Solid
- Any JSX-based framework

With valueless attributify syntax:

```jsx
// This needs the transformer
<div flex items-center gap-4 />

// This works without transformer (has values)
<div flex="~" items="center" gap="4" />
```

## Framework Setup

### React

```ts
// vite.config.ts
import React from '@vitejs/plugin-react'
import UnoCSS from 'unocss/vite'

export default {
  plugins: [
    UnoCSS(), // Must be before React
    React(),
  ],
}
```

```ts
// uno.config.ts
import { 
  defineConfig, 
  presetAttributify, 
  presetWind3,
  transformerAttributifyJsx 
} from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(),
    presetAttributify(),
  ],
  transformers: [
    transformerAttributifyJsx(),
  ],
})
```

### Preact

Same as React, use `@preact/preset-vite` or `@prefresh/vite`.

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

## TypeScript Support

Add type declarations:

```ts
// shims.d.ts
import type { AttributifyAttributes } from '@unocss/preset-attributify'

declare module 'react' {
  interface HTMLAttributes<T> extends AttributifyAttributes {}
}
```

<!-- 
Source references:
- https://unocss.dev/transformers/attributify-jsx
-->
