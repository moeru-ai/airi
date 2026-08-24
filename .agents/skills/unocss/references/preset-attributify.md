---
name: preset-attributify
description: Group utilities in HTML attributes instead of class
---

# Preset Attributify

Group utilities in HTML attributes for better readability.

## Installation

```ts
import { defineConfig, presetAttributify, presetWind3 } from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(),
    presetAttributify(),
  ],
})
```

## Basic Usage

Instead of long class strings:

```html
<button class="bg-blue-400 hover:bg-blue-500 text-sm text-white font-mono font-light py-2 px-4 rounded border-2 border-blue-200">
  Button
</button>
```

Group by prefix in attributes:

```html
<button
  bg="blue-400 hover:blue-500"
  text="sm white"
  font="mono light"
  p="y-2 x-4"
  border="2 rounded blue-200"
>
  Button
</button>
```

## Prefix Self-Referencing

For utilities matching their prefix (`flex`, `grid`, `border`), use `~`:

```html
<!-- Before -->
<button class="border border-red">Button</button>

<!-- After -->
<button border="~ red">Button</button>
```

## Valueless Attributify

Use utilities as boolean attributes:

```html
<div m-2 rounded text-teal-400 />
```

## Handling Property Conflicts

When attribute names conflict with HTML properties:

```html
<!-- Use un- prefix -->
<a un-text="red">Text color to red</a>
```

### Enforce Prefix

```ts
presetAttributify({
  prefix: 'un-',
  prefixedOnly: true,
})
```

## Options

```ts
presetAttributify({
  strict: false,           // Only generate CSS for attributify
  prefix: 'un-',           // Attribute prefix
  prefixedOnly: false,     // Require prefix for all
  nonValuedAttribute: true, // Support valueless attributes
  ignoreAttributes: [],    // Attributes to ignore
  trueToNonValued: false,  // Treat value="true" as valueless
})
```

## TypeScript Support

### Vue 3

```ts
// html.d.ts
declare module '@vue/runtime-dom' {
  interface HTMLAttributes { [key: string]: any }
}
declare module '@vue/runtime-core' {
  interface AllowedComponentProps { [key: string]: any }
}
export {}
```

### React

```ts
import type { AttributifyAttributes } from '@unocss/preset-attributify'

declare module 'react' {
  interface HTMLAttributes<T> extends AttributifyAttributes {}
}
```

## JSX Support

For JSX where `<div foo>` becomes `<div foo={true}>`:

```ts
import { transformerAttributifyJsx } from 'unocss'

export default defineConfig({
  transformers: [
    transformerAttributifyJsx(),
  ],
})
```

**Important:** Only use attributify if `uno.config.*` shows `presetAttributify()` is enabled.

<!-- 
Source references:
- https://unocss.dev/presets/attributify
-->
