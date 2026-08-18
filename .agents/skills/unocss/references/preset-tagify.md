---
name: preset-tagify
description: Use utilities as HTML tag names
---

# Preset Tagify

Use CSS utilities directly as HTML tag names.

## Installation

```ts
import { defineConfig, presetTagify } from 'unocss'

export default defineConfig({
  presets: [
    presetTagify(),
  ],
})
```

## Basic Usage

Instead of:

```html
<span class="text-red">red text</span>
<div class="flex">flexbox</div>
<span class="i-line-md-emoji-grin"></span>
```

Use tag names directly:

```html
<text-red>red text</text-red>
<flex>flexbox</flex>
<i-line-md-emoji-grin />
```

Works exactly the same!

## With Prefix

```ts
presetTagify({
  prefix: 'un-'
})
```

```html
<!-- Matched -->
<un-flex></un-flex>

<!-- Not matched -->
<flex></flex>
```

## Extra Properties

Add CSS properties to matched tags:

```ts
presetTagify({
  // Add display: inline-block to icons
  extraProperties: matched => matched.startsWith('i-')
    ? { display: 'inline-block' }
    : {},
})
```

Or apply to all:

```ts
presetTagify({
  extraProperties: { display: 'block' }
})
```

## Options

```ts
presetTagify({
  // Tag prefix
  prefix: '',
  
  // Excluded tags (won't be processed)
  excludedTags: ['b', /^h\d+$/, 'table'],
  
  // Extra CSS properties
  extraProperties: {},
  
  // Enable default extractor
  defaultExtractor: true,
})
```

## Excluded Tags

By default, these tags are excluded:
- `b` (bold)
- `h1` through `h6` (headings)
- `table`

Add your own:

```ts
presetTagify({
  excludedTags: [
    'b',
    /^h\d+$/,
    'table',
    'article',  // Add custom exclusions
    /^my-/,     // Exclude tags starting with 'my-'
  ],
})
```

## Use Cases

- Quick prototyping
- Cleaner HTML for simple pages
- Icon embedding: `<i-carbon-sun />`
- Semantic-like styling: `<flex-center>`, `<text-red>`

## Limitations

- Custom element names must contain a hyphen (HTML spec)
- Some frameworks may not support all custom elements
- Utilities without hyphens need the prefix option

<!-- 
Source references:
- https://unocss.dev/presets/tagify
-->
