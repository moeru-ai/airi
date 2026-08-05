---
name: preset-typography
description: Prose classes for typographic defaults on vanilla HTML content
---

# Preset Typography

Prose classes for adding typographic defaults to vanilla HTML content.

## Installation

```ts
import { defineConfig, presetTypography, presetWind3 } from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(), // Required!
    presetTypography(),
  ],
})
```

## Basic Usage

```html
<article class="prose">
  <h1>My Article</h1>
  <p>This is styled with typographic defaults...</p>
</article>
```

## Sizes

```html
<article class="prose prose-sm">Small</article>
<article class="prose prose-base">Base (default)</article>
<article class="prose prose-lg">Large</article>
<article class="prose prose-xl">Extra large</article>
<article class="prose prose-2xl">2X large</article>
```

Responsive:
```html
<article class="prose prose-sm md:prose-base lg:prose-lg">
  Responsive typography
</article>
```

## Colors

```html
<article class="prose prose-gray">Gray (default)</article>
<article class="prose prose-slate">Slate</article>
<article class="prose prose-blue">Blue</article>
```

## Dark Mode

```html
<article class="prose dark:prose-invert">
  Dark mode typography
</article>
```

## Excluding Elements

```html
<article class="prose">
  <p>Styled</p>
  <div class="not-prose">
    <p>NOT styled</p>
  </div>
</article>
```

**Note:** `not-prose` only works as a class.

## Options

```ts
presetTypography({
  selectorName: 'prose',      // Custom selector
  cssVarPrefix: '--un-prose', // CSS variable prefix
  important: false,           // Make !important
  cssExtend: {
    'code': { color: '#8b5cf6' },
    'a:hover': { color: '#f43f5e' },
  },
})
```

<!-- 
Source references:
- https://unocss.dev/presets/typography
-->
