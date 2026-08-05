---
name: unocss-shortcuts
description: Combine multiple utility rules into single shorthand classes
---

# UnoCSS Shortcuts

Shortcuts combine multiple rules into a single shorthand, inspired by Windi CSS.

## Static Shortcuts

Define as an object mapping shortcut names to utility combinations:

```ts
shortcuts: {
  // Multiple utilities combined
  'btn': 'py-2 px-4 font-semibold rounded-lg shadow-md',
  'btn-green': 'text-white bg-green-500 hover:bg-green-700',
  // Single utility alias
  'red': 'text-red-100',
}
```

Usage:
```html
<button class="btn btn-green">Click me</button>
```

## Dynamic Shortcuts

Use RegExp matcher with function, similar to dynamic rules:

```ts
shortcuts: [
  // Static shortcuts can be in array too
  {
    btn: 'py-2 px-4 font-semibold rounded-lg shadow-md',
  },
  // Dynamic shortcut
  [/^btn-(.*)$/, ([, c]) => `bg-${c}-400 text-${c}-100 py-2 px-4 rounded-lg`],
]
```

Now `btn-green` and `btn-red` generate:

```css
.btn-green {
  padding: 0.5rem 1rem;
  --un-bg-opacity: 1;
  background-color: rgb(74 222 128 / var(--un-bg-opacity));
  border-radius: 0.5rem;
  --un-text-opacity: 1;
  color: rgb(220 252 231 / var(--un-text-opacity));
}
```

## Accessing Theme in Shortcuts

Dynamic shortcuts receive context with theme access:

```ts
shortcuts: [
  [/^badge-(.*)$/, ([, c], { theme }) => {
    if (Object.keys(theme.colors).includes(c))
      return `bg-${c}4:10 text-${c}5 rounded`
  }],
]
```

## Shortcuts Layer

Shortcuts are output to the `shortcuts` layer by default. Configure with:

```ts
shortcutsLayer: 'my-shortcuts-layer'
```

## Key Points

- Later shortcuts have higher priority
- Shortcuts can reference other shortcuts
- Dynamic shortcuts work like dynamic rules
- Shortcuts are expanded at build time, not runtime
- All variants work with shortcuts (`hover:btn`, `dark:btn`, etc.)

<!-- 
Source references:
- https://unocss.dev/config/shortcuts
-->
