---
name: unocss-rules
description: Static and dynamic rules for generating CSS utilities in UnoCSS
---

# UnoCSS Rules

Rules define utility classes and the CSS they generate. UnoCSS has many built-in rules via presets and allows custom rules.

## Static Rules

Simple mapping from class name to CSS properties:

```ts
rules: [
  ['m-1', { margin: '0.25rem' }],
  ['font-bold', { 'font-weight': 700 }],
]
```

Usage: `<div class="m-1">` generates `.m-1 { margin: 0.25rem; }`

**Note:** Use CSS property syntax with hyphens (e.g., `font-weight` not `fontWeight`). Quote properties with hyphens.

## Dynamic Rules

Use RegExp matcher with function body for flexible utilities:

```ts
rules: [
  // Match m-1, m-2, m-100, etc.
  [/^m-(\d+)$/, ([, d]) => ({ margin: `${d / 4}rem` })],
  
  // Access theme and context
  [/^p-(\d+)$/, (match, ctx) => ({ padding: `${match[1] / 4}rem` })],
]
```

The function receives:
1. RegExp match result (destructure to get captured groups)
2. Context object with `theme`, `symbols`, etc.

## CSS Fallback Values

Return 2D array for CSS property fallbacks (browser compatibility):

```ts
rules: [
  [/^h-(\d+)dvh$/, ([_, d]) => [
    ['height', `${d}vh`],
    ['height', `${d}dvh`],
  ]],
]
```

Generates: `.h-100dvh { height: 100vh; height: 100dvh; }`

## Special Symbols

Control CSS output with symbols from `@unocss/core`:

```ts
import { symbols } from '@unocss/core'

rules: [
  ['grid', {
    [symbols.parent]: '@supports (display: grid)',
    display: 'grid',
  }],
]
```

### Available Symbols

| Symbol | Description |
|--------|-------------|
| `symbols.parent` | Parent wrapper (e.g., `@supports`, `@media`) |
| `symbols.selector` | Function to modify the selector |
| `symbols.layer` | Set the UnoCSS layer |
| `symbols.variants` | Array of variant handlers |
| `symbols.shortcutsNoMerge` | Disable merging in shortcuts |
| `symbols.noMerge` | Disable rule merging |
| `symbols.sort` | Override sorting order |
| `symbols.body` | Full control of CSS body |

## Multi-Selector Rules

Use generator functions to yield multiple CSS rules:

```ts
rules: [
  [/^button-(.*)$/, function* ([, color], { symbols }) {
    yield { background: color }
    yield {
      [symbols.selector]: selector => `${selector}:hover`,
      background: `color-mix(in srgb, ${color} 90%, black)`
    }
  }],
]
```

Generates both `.button-red { background: red; }` and `.button-red:hover { ... }`

## Fully Controlled Rules

Return a string for complete CSS control (advanced):

```ts
import { defineConfig, toEscapedSelector as e } from 'unocss'

rules: [
  [/^custom-(.+)$/, ([, name], { rawSelector, theme }) => {
    const selector = e(rawSelector)
    return `
${selector} { font-size: ${theme.fontSize.sm}; }
${selector}::after { content: 'after'; }
@media (min-width: ${theme.breakpoints.sm}) {
  ${selector} { font-size: ${theme.fontSize.lg}; }
}
`
  }],
]
```

**Warning:** Fully controlled rules don't work with variants like `hover:`.

## Symbols.body for Variant Support

Use `symbols.body` to keep variant support with custom CSS:

```ts
rules: [
  ['custom-red', {
    [symbols.body]: `
      font-size: 1rem;
      &::after { content: 'after'; }
      & > .bar { color: red; }
    `,
    [symbols.selector]: selector => `:is(${selector})`,
  }]
]
```

## Rule Ordering

Later rules have higher priority. Dynamic rules output is sorted alphabetically within the group.

## Rule Merging

UnoCSS merges rules with identical CSS bodies:

```html
<div class="m-2 hover:m2">
```

Generates:
```css
.hover\:m2:hover, .m-2 { margin: 0.5rem; }
```

Use `symbols.noMerge` to disable.

<!-- 
Source references:
- https://unocss.dev/config/rules
-->
