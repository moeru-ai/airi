---
name: unocss-variants
description: Apply variations like hover:, dark:, responsive to rules
---

# UnoCSS Variants

Variants apply modifications to utility rules, like `hover:`, `dark:`, or responsive prefixes.

## How Variants Work

When matching `hover:m-2`:

1. `hover:m-2` is extracted from source
2. Sent to all variants for matching
3. `hover:` variant matches and returns `m-2`
4. Result `m-2` continues to next variants
5. Finally matches the rule `.m-2 { margin: 0.5rem; }`
6. Variant transformation applied: `.hover\:m-2:hover { margin: 0.5rem; }`

## Creating Custom Variants

```ts
variants: [
  // hover: variant
  (matcher) => {
    if (!matcher.startsWith('hover:'))
      return matcher
    return {
      // Remove prefix, pass to next variants/rules
      matcher: matcher.slice(6),
      // Modify the selector
      selector: s => `${s}:hover`,
    }
  },
],
rules: [
  [/^m-(\d)$/, ([, d]) => ({ margin: `${d / 4}rem` })],
]
```

## Variant Return Object

- `matcher` - The processed class name to pass forward
- `selector` - Function to customize the CSS selector
- `parent` - Wrapper like `@media`, `@supports`
- `layer` - Specify output layer
- `sort` - Control ordering

## Built-in Variants (preset-wind3)

### Pseudo-classes
- `hover:`, `focus:`, `active:`, `visited:`
- `first:`, `last:`, `odd:`, `even:`
- `disabled:`, `checked:`, `required:`
- `focus-within:`, `focus-visible:`

### Pseudo-elements
- `before:`, `after:`
- `placeholder:`, `selection:`
- `marker:`, `file:`

### Responsive
- `sm:`, `md:`, `lg:`, `xl:`, `2xl:`
- `lt-sm:` (less than sm)
- `at-lg:` (at lg only)

### Dark Mode
- `dark:` - Class-based dark mode (default)
- `@dark:` - Media query dark mode

### Group/Peer
- `group-hover:`, `group-focus:`
- `peer-checked:`, `peer-focus:`

### Container Queries
- `@container`, `@sm:`, `@md:`

### Print
- `print:`

### Supports
- `supports-[display:grid]:`

### Aria
- `aria-checked:`, `aria-disabled:`

### Data Attributes
- `data-[state=open]:`

## Dark Mode Configuration

### Class-based (default)
```ts
presetWind3({
  dark: 'class'
})
```

```html
<div class="dark:bg-gray-800">
```

Generates: `.dark .dark\:bg-gray-800 { ... }`

### Media Query
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

### Custom Selectors
```ts
presetWind3({
  dark: {
    light: '.light-mode',
    dark: '.dark-mode',
  }
})
```

## CSS @layer Variant

Native CSS `@layer` support:

```html
<div class="layer-foo:p-4" />
```

Generates:
```css
@layer foo {
  .layer-foo\:p-4 { padding: 1rem; }
}
```

## Breakpoint Differences from Windi CSS

| Windi CSS | UnoCSS |
|-----------|--------|
| `<sm:p-1` | `lt-sm:p-1` |
| `@lg:p-1` | `at-lg:p-1` |
| `>xl:p-1` | `xl:p-1` |

## Media Hover (Experimental)

Addresses sticky hover on touch devices:

```html
<div class="@hover-text-red">
```

Generates:
```css
@media (hover: hover) and (pointer: fine) {
  .\@hover-text-red:hover { color: rgb(248 113 113); }
}
```

<!-- 
Source references:
- https://unocss.dev/config/variants
- https://unocss.dev/presets/wind3
- https://unocss.dev/presets/mini
-->
