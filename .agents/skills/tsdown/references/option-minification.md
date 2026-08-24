# Minification

Compress code to reduce bundle size.

## Overview

Minification removes unnecessary characters (whitespace, comments) and optimizes code for production, reducing bundle size and improving load times.

**Note:** Uses [Oxc minifier](https://oxc.rs/docs/contribute/minifier) internally. The minifier is currently in alpha.

## Type

```ts
minify?: boolean | 'dce-only' | MinifyOptions
```

- `true` — Enable full minification (whitespace removal, mangling, compression)
- `false` — Disable minification (default)
- `'dce-only'` — Only perform dead code elimination without full minification
- `MinifyOptions` — Pass detailed options to the Oxc minifier

## Basic Usage

### CLI

```bash
# Enable minification
tsdown --minify

# Disable minification
tsdown --no-minify
```

**Note:** The CLI `--minify` flag is a boolean toggle. For `'dce-only'` mode or advanced options, use the config file.

### Config File

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  minify: true,
})
```

### DCE-Only Mode

Remove dead code without full minification (keeps readable output):

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  minify: 'dce-only',
})
```

## Example Output

### Without Minification

```js
// dist/index.mjs
const x = 1

function hello(x$1) {
  console.log('Hello World')
  console.log(x$1)
}

hello(x)
```

### With Minification

```js
// dist/index.mjs
const e=1;function t(e){console.log(`Hello World`),console.log(e)}t(e);
```

## Common Patterns

### Production Build

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  minify: true,
  clean: true,
})
```

### Conditional Minification

```ts
export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm'],
  minify: !options.watch,  // Only minify in production
}))
```

### Browser Library

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['iife'],
  platform: 'browser',
  globalName: 'MyLib',
  minify: true,
})
```

### Multiple Builds

```ts
export default defineConfig([
  // Development build
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    minify: false,
    outDir: 'dist/dev',
  },
  // Production build
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    minify: true,
    outDir: 'dist/prod',
  },
])
```

## CLI Examples

```bash
# Production build with minification
tsdown --minify --clean

# Multiple formats with minification
tsdown --format esm --format cjs --minify

# Conditional minification (only when not watching)
tsdown --minify  # Or omit --watch
```

## Tips

1. **Use `minify: true`** for production builds
2. **Use `'dce-only'`** to remove dead code while keeping output readable
3. **Skip minification** during development for faster rebuilds
4. **Combine with tree shaking** for best results
5. **Test minified output** thoroughly (Oxc minifier is in alpha)

## Troubleshooting

### Minified Code Has Bugs

Oxc minifier is in alpha and may have issues:

1. **Use DCE-only mode**: `minify: 'dce-only'`
2. **Report bug** to [Oxc project](https://github.com/oxc-project/oxc/issues)
3. **Disable minification**: `minify: false`

### Unexpected Output

- **Test unminified** first to isolate issue
- **Check source maps** for debugging
- **Verify target compatibility**

## Related Options

- [Tree Shaking](option-tree-shaking.md) - Remove unused code
- [Target](option-target.md) - Syntax transformations
- [Output Format](option-output-format.md) - Module formats
- [Sourcemap](option-sourcemap.md) - Debug information
