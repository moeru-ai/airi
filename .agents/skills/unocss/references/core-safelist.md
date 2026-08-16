---
name: unocss-safelist-blocklist
description: Force include or exclude specific utilities
---

# Safelist and Blocklist

Control which utilities are always included or excluded.

## Safelist

Utilities always included, regardless of detection:

```ts
export default defineConfig({
  safelist: [
    'p-1', 'p-2', 'p-3',
    // Dynamic generation
    ...Array.from({ length: 4 }, (_, i) => `p-${i + 1}`),
  ],
})
```

### Function Form

```ts
safelist: [
  'p-1',
  () => ['m-1', 'm-2'],
  (context) => {
    const colors = Object.keys(context.theme.colors || {})
    return colors.map(c => `bg-${c}-500`)
  },
]
```

### Common Use Cases

```ts
safelist: [
  // Dynamic colors from CMS
  () => ['primary', 'secondary'].flatMap(c => [
    `bg-${c}`, `text-${c}`, `border-${c}`,
  ]),
  
  // Component variants
  () => {
    const variants = ['primary', 'danger']
    const sizes = ['sm', 'md', 'lg']
    return variants.flatMap(v => sizes.map(s => `btn-${v}-${s}`))
  },
]
```

## Blocklist

Utilities never generated:

```ts
blocklist: [
  'p-1',           // Exact match
  /^p-[2-4]$/,     // Regex
]
```

### With Messages

```ts
blocklist: [
  ['bg-red-500', { message: 'Use bg-red-600 instead' }],
  [/^text-xs$/, { message: 'Use text-sm for accessibility' }],
]
```

## Safelist vs Blocklist

| Feature | Safelist | Blocklist |
|---------|----------|-----------|
| Purpose | Always include | Always exclude |
| Strings | ✅ | ✅ |
| Regex | ❌ | ✅ |
| Functions | ✅ | ❌ |

**Note:** Blocklist wins if utility is in both.

## Best Practice

Prefer static mappings over safelist:

```ts
// Better: UnoCSS extracts automatically
const sizes = {
  sm: 'text-sm p-2',
  md: 'text-base p-4',
}

// Avoid: Large safelist
safelist: ['text-sm', 'text-base', 'p-2', 'p-4']
```

<!-- 
Source references:
- https://unocss.dev/config/safelist
- https://unocss.dev/guide/extracting
-->
