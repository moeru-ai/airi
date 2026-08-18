---
name: unocss-layers-preflights
description: CSS layer ordering and raw CSS injection
---

# Layers and Preflights

Control CSS output order and inject global CSS.

## Layers

Set layer on rules:

```ts
rules: [
  [/^m-(\d)$/, ([, d]) => ({ margin: `${d / 4}rem` }), { layer: 'utilities' }],
  ['btn', { padding: '4px' }], // default layer
]
```

### Layer Ordering

```ts
layers: {
  'components': -1,
  'default': 1,
  'utilities': 2,
}
```

### Import Layers Separately

```ts
import 'uno:components.css'
import 'uno.css'
import './my-custom.css'
import 'uno:utilities.css'
```

### CSS Cascade Layers

```ts
outputToCssLayers: true

// Or with custom names
outputToCssLayers: {
  cssLayerName: (layer) => {
    if (layer === 'default') return 'utilities'
    if (layer === 'shortcuts') return 'utilities.shortcuts'
  }
}
```

## Layer Variants

```html
<!-- UnoCSS layer -->
<p class="uno-layer-my-layer:text-xl">

<!-- CSS @layer -->
<p class="layer-my-layer:text-xl">
```

## Preflights

Inject raw CSS globally:

```ts
preflights: [
  {
    getCSS: ({ theme }) => `
      * {
        color: ${theme.colors.gray?.[700] ?? '#333'};
        margin: 0;
      }
    `,
  },
]
```

With layer:

```ts
preflights: [
  {
    layer: 'base',
    getCSS: () => `html { font-family: system-ui; }`,
  },
]
```

## preset-wind4 Layers

| Layer | Description | Order |
|-------|-------------|-------|
| `properties` | CSS @property rules | -200 |
| `theme` | Theme CSS variables | -150 |
| `base` | Reset styles | -100 |

<!-- 
Source references:
- https://unocss.dev/config/layers
- https://unocss.dev/config/preflights
-->
