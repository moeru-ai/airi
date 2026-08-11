---
name: unocss-theme
description: Theming system for colors, breakpoints, and design tokens
---

# UnoCSS Theme

UnoCSS supports theming similar to Tailwind CSS / Windi CSS. The `theme` property is deep-merged with the default theme.

## Basic Usage

```ts
theme: {
  colors: {
    veryCool: '#0000ff', // class="text-very-cool"
    brand: {
      primary: 'hsl(var(--hue, 217) 78% 51%)', // class="bg-brand-primary"
      DEFAULT: '#942192' // class="bg-brand"
    },
  },
}
```

## Using Theme in Rules

Access theme values in dynamic rules:

```ts
rules: [
  [/^text-(.*)$/, ([, c], { theme }) => {
    if (theme.colors[c])
      return { color: theme.colors[c] }
  }],
]
```

## Using Theme in Variants

```ts
variants: [
  {
    name: 'variant-name',
    match(matcher, { theme }) {
      // Access theme.breakpoints, theme.colors, etc.
    },
  },
]
```

## Using Theme in Shortcuts

```ts
shortcuts: [
  [/^badge-(.*)$/, ([, c], { theme }) => {
    if (Object.keys(theme.colors).includes(c))
      return `bg-${c}4:10 text-${c}5 rounded`
  }],
]
```

## Breakpoints

**Warning:** Custom `breakpoints` object **overrides** the default, not merges.

```ts
theme: {
  breakpoints: {
    sm: '320px',
    md: '640px',
  },
}
```

Only `sm:` and `md:` variants will be available.

### Inherit Default Breakpoints

Use `extendTheme` to merge with defaults:

```ts
extendTheme: (theme) => {
  return {
    ...theme,
    breakpoints: {
      ...theme.breakpoints,
      sm: '320px',
      md: '640px',
    },
  }
}
```

**Note:** `verticalBreakpoints` works the same for vertical layout.

### Breakpoint Sorting

Breakpoints are sorted by size. Use consistent units to avoid errors:

```ts
theme: {
  breakpoints: {
    sm: '320px',
    // Don't mix units - convert rem to px
    // md: '40rem', // Bad
    md: `${40 * 16}px`, // Good
    lg: '960px',
  },
}
```

## ExtendTheme

`extendTheme` lets you modify the merged theme object:

### Mutate Theme

```ts
extendTheme: (theme) => {
  theme.colors.veryCool = '#0000ff'
  theme.colors.brand = {
    primary: 'hsl(var(--hue, 217) 78% 51%)',
  }
}
```

### Replace Theme

Return a new object to completely replace:

```ts
extendTheme: (theme) => {
  return {
    ...theme,
    colors: {
      ...theme.colors,
      veryCool: '#0000ff',
    },
  }
}
```

## Theme Differences in Presets

### preset-wind3 vs preset-wind4

| preset-wind3 | preset-wind4 |
|--------------|--------------|
| `fontFamily` | `font` |
| `fontSize` | `text.fontSize` |
| `lineHeight` | `text.lineHeight` or `leading` |
| `letterSpacing` | `text.letterSpacing` or `tracking` |
| `borderRadius` | `radius` |
| `easing` | `ease` |
| `breakpoints` | `breakpoint` |
| `boxShadow` | `shadow` |
| `transitionProperty` | `property` |

## Common Theme Keys

- `colors` - Color palette
- `breakpoints` - Responsive breakpoints
- `fontFamily` - Font stacks
- `fontSize` - Text sizes
- `spacing` - Spacing scale
- `borderRadius` - Border radius values
- `boxShadow` - Shadow definitions
- `animation` - Animation keyframes and timing

<!-- 
Source references:
- https://unocss.dev/config/theme
-->
