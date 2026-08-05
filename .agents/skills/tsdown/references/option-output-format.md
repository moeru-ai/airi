# Output Format

Configure the module format(s) for generated bundles.

## Overview

tsdown can generate bundles in multiple formats. Default is ESM.

## Available Formats

| Format | Description | Use Case |
|--------|-------------|----------|
| `esm` | ECMAScript Module (default) | Modern Node.js, browsers, Deno |
| `cjs` | CommonJS | Legacy Node.js, require() |
| `iife` | Immediately Invoked Function Expression | Browser `<script>` tags |
| `umd` | Universal Module Definition | AMD, CommonJS, and globals |

## Usage

### CLI

```bash
# Single format
tsdown --format esm

# Multiple formats
tsdown --format esm --format cjs

# Or comma-separated
tsdown --format esm,cjs
```

### Config File

#### Single Format

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
})
```

#### Multiple Formats

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
})
```

## Per-Format Configuration

Override options for specific formats:

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: {
    esm: {
      target: ['es2015'],
    },
    cjs: {
      target: ['node20'],
    },
  },
})
```

This allows different targets, platforms, or other settings per format.

## Common Patterns

### Modern Library (ESM + CJS)

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
})
```

Output:
- `dist/index.mjs` (ESM)
- `dist/index.cjs` (CJS)
- `dist/index.d.ts` (Types)

### Browser Library (IIFE)

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['iife'],
  globalName: 'MyLib',
  platform: 'browser',
  minify: true,
})
```

Output: `dist/index.iife.js` (IIFE with global `MyLib`)

### Universal Library (UMD)

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['umd'],
  globalName: 'MyLib',
  platform: 'neutral',
})
```

Works with AMD, CommonJS, and browser globals.

### Node.js Package (CJS + ESM)

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'node',
  dts: true,
  shims: true, // Add __dirname, __filename for CJS compat
})
```

### Framework Component Library

```ts
export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm', 'cjs'],
  deps: {
    neverBundle: ['react', 'react-dom'], // Don't bundle dependencies
  },
  dts: true,
})
```

## Format-Specific Outputs

### File Extensions

| Format | Extension |
|--------|-----------|
| ESM | `.mjs` or `.js` (with `"type": "module"`) |
| CJS | `.cjs` or `.js` (without `"type": "module"`) |
| IIFE | `.iife.js` |
| UMD | `.umd.js` |

For custom IIFE filenames, set `outputOptions.entryFileNames`. `outExtensions` customizes extensions or suffixes but does not remove `.iife` or `.umd`.

### Customize Extensions

Use `outExtensions` to override:

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  outExtensions: ({ format }) => ({
    js: format === 'esm' ? '.js' : '.cjs',
  }),
})
```

## Tips

1. **Use ESM + CJS** for maximum compatibility
2. **Use IIFE** for browser-only libraries
3. **Use UMD** for universal compatibility (less common now)
4. **Externalize dependencies** to avoid bundling framework code
5. **Add shims** for CJS compatibility when using Node.js APIs
6. **Set globalName** for IIFE/UMD formats

## Related Options

- [Target](option-target.md) - Set JavaScript version
- [Platform](option-platform.md) - Set platform (node, browser, neutral)
- [Shims](option-shims.md) - Add ESM/CJS compatibility
- [Output Directory](option-output-directory.md) - Customize output paths
