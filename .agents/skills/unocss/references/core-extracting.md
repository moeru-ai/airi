---
name: unocss-extracting
description: How UnoCSS extracts utilities from source code
---

# Extracting

UnoCSS searches for utility usages in your codebase and generates CSS on-demand.

## Content Sources

### Pipeline Extraction (Vite/Webpack)

Most efficient - extracts from build tool pipeline.

**Default file types:** `.jsx`, `.tsx`, `.vue`, `.md`, `.html`, `.svelte`, `.astro`, `.marko`

**Not included by default:** `.js`, `.ts`

```ts
export default defineConfig({
  content: {
    pipeline: {
      include: [
        /\.(vue|svelte|[jt]sx|mdx?|astro|html)($|\?)/,
        'src/**/*.{js,ts}', // Add js/ts
      ],
    },
  },
})
```

### Filesystem Extraction

For files not in build pipeline:

```ts
export default defineConfig({
  content: {
    filesystem: [
      'src/**/*.php',
      'public/*.html',
    ],
  },
})
```

### Inline Text Extraction

```ts
export default defineConfig({
  content: {
    inline: [
      '<div class="p-4 text-red">Some text</div>',
      async () => (await fetch('https://example.com')).text(),
    ],
  },
})
```

## Magic Comments

### @unocss-include

Force scan a file:

```ts
// @unocss-include
export const classes = {
  active: 'bg-primary text-white',
}
```

### @unocss-ignore

Skip entire file:

```ts
// @unocss-ignore
```

### @unocss-skip-start / @unocss-skip-end

Skip specific blocks:

```html
<p class="text-green">Extracted</p>
<!-- @unocss-skip-start -->
<p class="text-red">NOT extracted</p>
<!-- @unocss-skip-end -->
```

## Limitations

UnoCSS works at **build time** - dynamic classes don't work:

```html
<!-- Won't work! -->
<div class="p-${size}"></div>
```

### Solutions

**1. Safelist** - Pre-generate known values:

```ts
safelist: ['p-1', 'p-2', 'p-3', 'p-4']
```

**2. Static mapping** - List combinations statically:

```ts
const colors = {
  red: 'text-red border-red',
  blue: 'text-blue border-blue',
}
```

**3. Runtime** - Use `@unocss/runtime` for true runtime generation.

## Custom Extractors

```ts
extractors: [
  {
    name: 'my-extractor',
    extract({ code }) {
      return code.match(/class:[\w-]+/g) || []
    },
  },
]
```

<!-- 
Source references:
- https://unocss.dev/guide/extracting
-->
