# CSS Support

**Status: Experimental — API and behavior may change.**

Configure CSS handling including preprocessors, syntax lowering, minification, and code splitting.

## Getting Started

All CSS support in `tsdown` is provided by the `@tsdown/css` package. Install it to enable CSS handling:

```bash
npm install -D @tsdown/css
```

When `@tsdown/css` is installed, CSS processing is automatically enabled. Without it, encountering CSS files will result in an error.

## CSS Import

Import `.css` files from TypeScript/JavaScript — CSS is extracted into separate `.css` assets:

```ts
// src/index.ts
import './style.css'
export function greet() { return 'Hello' }
```

Output: `index.mjs` + `index.css`

### `@import` Inlining

CSS `@import` statements are resolved and inlined automatically. No separate output files produced.

### Inline CSS (`?inline`)

Append `?inline` to return processed CSS as a JS string instead of emitting a `.css` file:

```ts
import './style.css'                   // → .css file
import css from './theme.css?inline'   // → JS string
```

Works with preprocessors too (`./foo.scss?inline`). Goes through full pipeline (preprocessors, @import inlining, lowering, minification). Tree-shakeable (`moduleSideEffects: false`).

## CSS Pre-processors

Built-in support for Sass, Less, and Stylus. Install the preprocessor:

```bash
# Sass (either one)
npm install -D sass-embedded  # recommended, faster
npm install -D sass

# Less
npm install -D less

# Stylus
npm install -D stylus
```

Then import directly:

```ts
import './style.scss'
import './theme.less'
import './global.styl'
```

### Preprocessor Options

```ts
export default defineConfig({
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `$brand-color: #ff7e17;`,
      },
      less: {
        math: 'always',
      },
      stylus: {
        define: { '$brand-color': '#ff7e17' },
      },
    },
  },
})
```

### `additionalData`

Inject code at the beginning of every preprocessor file:

```ts
// String form
scss: {
  additionalData: `@use "src/styles/variables" as *;`,
}

// Function form
scss: {
  additionalData: (source, filename) => {
    if (filename.includes('theme')) return source
    return `@use "src/styles/variables" as *;\n${source}`
  },
}
```

## CSS Minification

```ts
export default defineConfig({
  css: {
    minify: true,
  },
})
```

Powered by Lightning CSS.

## CSS Target

Override the top-level `target` specifically for CSS:

```ts
export default defineConfig({
  target: 'node18',
  css: {
    target: 'chrome90', // CSS-specific target
  },
})
```

Set `css.target: false` to disable CSS syntax lowering entirely.

## CSS Transformer

`css.transformer` controls mutually exclusive CSS processing paths:

- `'lightningcss'` (default): `@import` via Lightning CSS `bundleAsync()`, no PostCSS.
- `'postcss'`: `@import` via `postcss-import`, PostCSS plugins applied, Lightning CSS for final transform only.

```ts
export default defineConfig({
  css: {
    transformer: 'postcss',
  },
})
```

### PostCSS Options

```ts
export default defineConfig({
  css: {
    transformer: 'postcss',
    postcss: {
      plugins: [require('autoprefixer')],
    },
    // Or: postcss: './config' — path to search for postcss.config.js
  },
})
```

Auto-detects PostCSS config from project root when `transformer` is `'postcss'` and `css.postcss` is omitted.

## Lightning CSS (Syntax Lowering)

Install `lightningcss` to enable CSS syntax lowering based on your `target`:

```bash
npm install -D lightningcss
```

When `target` is set (e.g., `target: 'chrome108'`), modern CSS features are automatically downleveled:

```css
/* Input */
.foo { & .bar { color: red } }

/* Output (chrome108) */
.foo .bar { color: red }
```

### Custom Lightning CSS Options

```ts
import { Features } from 'lightningcss'

export default defineConfig({
  css: {
    lightningcss: {
      targets: { chrome: 100 << 16 },
      include: Features.Nesting,
    },
  },
})
```

`css.lightningcss.targets` takes precedence over both `target` and `css.target` for CSS.

## CSS Modules

Files with `.module.css` (and `.module.scss`, `.module.less`, etc.) are treated as CSS modules — class names are scoped and exported as JS:

```ts
import styles from './app.module.css'
console.log(styles.title) // "scoped_title_hash"
```

### Configuration

```ts
export default defineConfig({
  css: {
    modules: {
      scopeBehaviour: 'local',             // 'local' (default) | 'global'
      generateScopedName: '[hash]_[local]', // Lightning CSS pattern string
      localsConvention: 'camelCase',       // 'camelCase' | 'camelCaseOnly' | 'dashes' | 'dashesOnly'
    },
  },
})
```

Set `css.modules: false` to disable. Function-form `generateScopedName` requires `transformer: 'postcss'`.

### Optional Dependencies (PostCSS path)

```bash
npm install -D postcss postcss-modules
```

## Code Splitting

### Merged (Default)

All CSS merged into a single file (default: `style.css`).

```ts
export default defineConfig({
  css: {
    fileName: 'my-library.css', // Custom name (default: 'style.css')
  },
})
```

### Per-Chunk Splitting

```ts
export default defineConfig({
  css: {
    splitting: true, // Each JS chunk gets a corresponding .css file
  },
})
```

## Preserving CSS Imports (`css.inject`)

When enabled, JS output preserves `import` statements pointing to emitted CSS files. Consumers auto-import CSS alongside JS:

```ts
export default defineConfig({
  css: {
    inject: true,
  },
})
```

## PostCSS Optional Peer Dependencies

When using `transformer: 'postcss'`, install these as needed:

| Package | Purpose | Required When |
|---------|---------|---------------|
| `postcss` | Core PostCSS engine | Always (with `transformer: 'postcss'`) |
| `postcss-import` | Resolve/inline `@import` | CSS uses `@import` |
| `postcss-modules` | CSS modules (scoped classes) | Using `.module.css` files |

```bash
npm install -D postcss postcss-import postcss-modules
```

All declared as optional peer dependencies of `@tsdown/css`.

## Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `css.transformer` | `'postcss' \| 'lightningcss'` | `'lightningcss'` | CSS processing pipeline |
| `css.splitting` | `boolean` | `false` | Per-chunk CSS splitting |
| `css.fileName` | `string` | `'style.css'` | Merged CSS file name |
| `css.minify` | `boolean` | `false` | CSS minification |
| `css.modules` | `object \| false` | `{}` | CSS modules config, or `false` to disable |
| `css.inject` | `boolean` | `false` | Preserve CSS imports in JS output |
| `css.target` | `string \| string[] \| false` | _from `target`_ | CSS-specific lowering target |
| `css.postcss` | `string \| object` | — | PostCSS config path or inline options |
| `css.preprocessorOptions` | `object` | — | Preprocessor options |
| `css.lightningcss` | `object` | — | Lightning CSS options |

## Related

- [Target](option-target.md) - Configure syntax lowering targets
- [Output Format](option-output-format.md) - Module output formats
