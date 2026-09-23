# Source Maps

Generate source maps for debugging bundled code.

## Overview

Source maps map minified/bundled code back to original source files, making debugging significantly easier by showing original line numbers and variable names.

## Basic Usage

### CLI

```bash
tsdown --sourcemap

# Or inline
tsdown --sourcemap inline
```

### Config File

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  sourcemap: true,
})
```

## Source Map Types

### External (default)

Generates separate `.map` files:

```ts
export default defineConfig({
  sourcemap: true,  // or 'external'
})
```

**Output:**
- `dist/index.mjs`
- `dist/index.mjs.map`

**Pros:**
- Smaller bundle size
- Can be excluded from production
- Faster parsing

### Inline

Embeds source maps in the bundle:

```ts
export default defineConfig({
  sourcemap: 'inline',
})
```

**Output:**
- `dist/index.mjs` (includes source map as data URL)

**Pros:**
- Single file deployment
- Guaranteed to be available

**Cons:**
- Larger bundle size
- Exposed in production

### Hidden

Generates map files without reference comment:

```ts
export default defineConfig({
  sourcemap: 'hidden',
})
```

**Output:**
- `dist/index.mjs` (no `//# sourceMappingURL` comment)
- `dist/index.mjs.map`

**Use when:**
- You want maps for error reporting tools
- But don't want them exposed to users

## Auto-Enable Scenarios

### Declaration Maps

If `declarationMap` is enabled in `tsconfig.json`, source maps are automatically enabled:

```json
// tsconfig.json
{
  "compilerOptions": {
    "declarationMap": true
  }
}
```

This also generates `.d.ts.map` files for TypeScript declarations.

## Common Patterns

### Development Build

```ts
export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  sourcemap: options.watch,  // Only in dev
  minify: !options.watch,
}))
```

### Production with External Maps

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  sourcemap: true,  // External maps
  minify: true,
})
```

Deploy maps to separate error reporting service.

### Always Inline (Development Tool)

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  sourcemap: 'inline',
})
```

### Per-Format Source Maps

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: {
    esm: {
      sourcemap: true,
    },
    iife: {
      sourcemap: 'inline',  // Inline for browser
    },
  },
})
```

### TypeScript Library with Declaration Maps

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  sourcemap: true,
  dts: {
    sourcemap: true,  // Enable declaration maps
  },
})
```

**Output:**
- `dist/index.mjs` + `dist/index.mjs.map`
- `dist/index.cjs` + `dist/index.cjs.map`
- `dist/index.d.ts` + `dist/index.d.ts.map`

## Benefits

### For Development

- **Faster debugging** - See original code in debugger
- **Better error messages** - Stack traces show original lines
- **Easier breakpoints** - Set breakpoints on source code

### For Production

- **Error reporting** - Send accurate error locations to services
- **Monitoring** - Track errors back to source
- **Support** - Help users report issues accurately

## Performance Impact

| Type | Bundle Size | Parse Speed | Debugging |
|------|-------------|-------------|-----------|
| None | Smallest | Fastest | Hard |
| External | Small | Fast | Easy |
| Inline | Largest | Slower | Easy |
| Hidden | Small | Fast | Tools only |

## CLI Examples

```bash
# Enable source maps
tsdown --sourcemap

# Inline source maps
tsdown --sourcemap inline

# Hidden source maps
tsdown --sourcemap hidden

# Development with source maps
tsdown --watch --sourcemap

# Production with external maps
tsdown --minify --sourcemap

# No source maps
tsdown --no-sourcemap
```

## Use Cases

### Local Development

```ts
export default defineConfig({
  sourcemap: true,
  minify: false,
})
```

### Production Build

```ts
export default defineConfig({
  sourcemap: 'external',  // Upload to error service
  minify: true,
})
```

### Browser Library

```ts
export default defineConfig({
  format: ['iife'],
  platform: 'browser',
  sourcemap: 'inline',  // Self-contained
  globalName: 'MyLib',
})
```

### Node.js CLI Tool

```ts
export default defineConfig({
  format: ['esm'],
  platform: 'node',
  sourcemap: true,
  shims: true,
})
```

## Troubleshooting

### Source Maps Not Working

1. **Check output** - Verify `.map` files are generated
2. **Check reference** - Look for `//# sourceMappingURL=` comment
3. **Check paths** - Ensure relative paths are correct
4. **Check tool** - Verify debugger/browser supports source maps

### Large Bundle Size

Use external source maps instead of inline:

```ts
export default defineConfig({
  sourcemap: true,  // Not 'inline'
})
```

### Source Not Found

- Ensure source files are accessible relative to map
- Check `sourceRoot` in generated map
- Verify paths in `sources` array

## Tips

1. **Use external maps** for production (smaller bundles)
2. **Use inline maps** for single-file tools
3. **Enable in development** for better DX
4. **Upload to error services** for production debugging
5. **Use hidden maps** when you want them for tools only
6. **Enable declaration maps** for TypeScript libraries

## Related Options

- [Minification](option-minification.md) - Code compression
- [DTS](option-dts.md) - TypeScript declarations
- [Watch Mode](option-watch-mode.md) - Development workflow
- [Target](option-target.md) - Syntax transformations
