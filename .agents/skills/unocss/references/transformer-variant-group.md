---
name: transformer-variant-group
description: Shorthand for grouping utilities with common prefixes
---

# Transformer Variant Group

Enables shorthand syntax for grouping utilities with common prefixes.

## Installation

```ts
import { defineConfig, transformerVariantGroup } from 'unocss'

export default defineConfig({
  transformers: [
    transformerVariantGroup(),
  ],
})
```

## Usage

Group multiple utilities under one variant prefix using parentheses:

```html
<!-- Before transformation -->
<div class="hover:(bg-gray-400 font-medium) font-(light mono)" />

<!-- After transformation -->
<div class="hover:bg-gray-400 hover:font-medium font-light font-mono" />
```

## Examples

### Hover States

```html
<button class="hover:(bg-blue-600 text-white scale-105)">
  Hover me
</button>
```

Expands to: `hover:bg-blue-600 hover:text-white hover:scale-105`

### Dark Mode

```html
<div class="dark:(bg-gray-800 text-white)">
  Dark content
</div>
```

Expands to: `dark:bg-gray-800 dark:text-white`

### Responsive

```html
<div class="md:(flex items-center gap-4)">
  Responsive flex
</div>
```

Expands to: `md:flex md:items-center md:gap-4`

### Nested Groups

```html
<div class="lg:hover:(bg-blue-500 text-white)">
  Large screen hover
</div>
```

Expands to: `lg:hover:bg-blue-500 lg:hover:text-white`

### Multiple Prefixes

```html
<div class="text-(sm gray-600) font-(medium mono)">
  Styled text
</div>
```

Expands to: `text-sm text-gray-600 font-medium font-mono`

## Key Points

- Use parentheses `()` to group utilities
- The prefix applies to all utilities inside the group
- Can be combined with any variant (hover, dark, responsive, etc.)
- Nesting is supported
- Works in class attributes and other extraction sources

<!-- 
Source references:
- https://unocss.dev/transformers/variant-group
-->
