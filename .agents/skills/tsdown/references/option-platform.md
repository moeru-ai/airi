# Platform

Target runtime environment for bundled code.

## Overview

Platform determines the runtime environment and affects module resolution, built-in handling, and optimizations.

## Available Platforms

| Platform | Runtime | Built-ins | Use Case |
|----------|---------|-----------|----------|
| `node` | Node.js (default) | Resolved automatically | Server-side, CLIs, tooling |
| `browser` | Web browsers | Warning if used | Front-end applications |
| `neutral` | Platform-agnostic | No assumptions | Universal libraries |

## Usage

### CLI

```bash
tsdown --platform node     # Default
tsdown --platform browser
tsdown --platform neutral
```

### Config File

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  platform: 'browser',
})
```

## Platform Details

### Node Platform

**Default platform** for server-side and tooling.

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  platform: 'node',
})
```

**Characteristics:**
- Node.js built-ins (fs, path, etc.) resolved automatically
- Optimized for Node.js runtime
- Compatible with Deno and Bun
- Default mainFields: `['main', 'module']`

### Browser Platform

For web applications running in browsers.

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  platform: 'browser',
  format: ['esm'],
})
```

**Characteristics:**
- Warnings if Node.js built-ins are used
- May require polyfills for Node APIs
- Optimized for browser environments
- Default mainFields: `['browser', 'module', 'main']`

### Neutral Platform

Platform-agnostic for universal libraries.

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  platform: 'neutral',
  format: ['esm'],
})
```

**Characteristics:**
- No runtime assumptions
- No automatic built-in resolution
- Relies on `exports` field only
- Default mainFields: `[]`
- Full control over runtime behavior

## CJS Format Limitation

**CJS format always uses `node` platform** and cannot be changed.

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  platform: 'browser',  // Ignored for CJS
})
```

See [rolldown PR #4693](https://github.com/rolldown/rolldown/pull/4693#issuecomment-2912229545) for details.

## Module Resolution

### Main Fields

Different platforms check different `package.json` fields:

| Platform | mainFields | Priority |
|----------|------------|----------|
| `node` | `['main', 'module']` | main → module |
| `browser` | `['browser', 'module', 'main']` | browser → module → main |
| `neutral` | `[]` | Only `exports` field |

### Neutral Platform Resolution

When using `neutral`, packages without `exports` field may fail to resolve:

```
Help: The "main" field here was ignored. Main fields must be configured
explicitly when using the "neutral" platform.
```

**Solution:** Configure mainFields explicitly:

```ts
export default defineConfig({
  platform: 'neutral',
  inputOptions: {
    resolve: {
      mainFields: ['module', 'main'],
    },
  },
})
```

## Common Patterns

### Node.js CLI Tool

```ts
export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  platform: 'node',
  shims: true,
})
```

### Browser Library (IIFE)

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['iife'],
  platform: 'browser',
  globalName: 'MyLib',
  minify: true,
})
```

### Universal Library

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'neutral',
  inputOptions: {
    resolve: {
      mainFields: ['module', 'main'],
    },
  },
})
```

### React Component Library

```ts
export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm', 'cjs'],
  platform: 'browser',
  deps: {
    neverBundle: ['react', 'react-dom'],
  },
})
```

### Node.js + Browser Builds

```ts
export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    platform: 'node',
  },
  {
    entry: ['src/browser.ts'],
    format: ['esm'],
    platform: 'browser',
  },
])
```

## Troubleshooting

### Node Built-in Warnings (Browser)

When using Node.js APIs in browser builds:

```
Warning: Module "fs" has been externalized for browser compatibility
```

**Solutions:**
1. Use platform: 'node' if not browser-only
2. Add polyfills for Node APIs
3. Avoid Node.js built-ins in browser code
4. Use platform: 'neutral' with careful dependency management

### Module Resolution Issues (Neutral)

When packages don't resolve with `neutral`:

```ts
export default defineConfig({
  platform: 'neutral',
  inputOptions: {
    resolve: {
      mainFields: ['module', 'browser', 'main'],
      conditions: ['import', 'require'],
    },
  },
})
```

## Tips

1. **Use `node`** for server-side and CLIs (default)
2. **Use `browser`** for front-end applications
3. **Use `neutral`** for universal libraries
4. **Configure mainFields** when using neutral platform
5. **CJS is always node** - use ESM for other platforms
6. **Test in target environment** to verify compatibility

## Related Options

- [Output Format](option-output-format.md) - Module formats
- [Target](option-target.md) - JavaScript version
- [Shims](option-shims.md) - ESM/CJS compatibility
- [Dependencies](option-dependencies.md) - External packages
