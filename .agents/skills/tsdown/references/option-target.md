# Target Environment

Configure JavaScript syntax transformations for target environments.

## Overview

The `target` option controls which JavaScript features are downleveled (transformed to older syntax) for compatibility.

**Important:** Only affects syntax transformations, not runtime polyfills.

## Default Behavior

tsdown auto-reads from `package.json`:

```json
// package.json
{
  "engines": {
    "node": ">=18.0.0"
  }
}
```

Automatically sets `target` to `node18.0.0`.

If no `engines.node` field exists, behaves as if `target: false` (no transformations).

## Disabling Transformations

Set to `false` to preserve modern syntax:

```ts
export default defineConfig({
  target: false,
})
```

**Result:**
- No JavaScript downleveling
- Modern features preserved (optional chaining `?.`, nullish coalescing `??`, etc.)

**Use when:**
- Targeting modern environments
- Handling transformations elsewhere
- Building libraries for further processing

## Setting Target

### CLI

```bash
# Single target
tsdown --target es2020
tsdown --target node20

# Multiple targets
tsdown --target chrome100 --target node20.18

# Disable
tsdown --no-target
```

### Config File

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  target: 'es2020',
})
```

### Multiple Targets

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  target: ['chrome100', 'safari15', 'node18'],
})
```

## Supported Targets

### ECMAScript Versions

- `es2015`, `es2016`, `es2017`, `es2018`, `es2019`, `es2020`, `es2021`, `es2022`, `es2023`, `esnext`

### Browser Versions

- `chrome100`, `safari18`, `firefox110`, `edge100`, etc.

### Node.js Versions

- `node16`, `node18`, `node20`, `node20.18`, etc.

## Examples

### Modern Browsers

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: ['chrome100', 'safari15', 'firefox100'],
})
```

### Node.js Library

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  target: 'node18',
})
```

### Legacy Support

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2015',  // Maximum compatibility
})
```

### Per-Format Targets

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: {
    esm: {
      target: 'es2020',
    },
    cjs: {
      target: 'node16',
    },
  },
})
```

## Decorators

### Legacy Decorators (Stage 2)

Enable in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

### Stage 3 Decorators

**Not currently supported** by tsdown/Rolldown/Oxc.

See [oxc issue #9170](https://github.com/oxc-project/oxc/issues/9170).

## Common Patterns

### Universal Library

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  target: 'es2020',  // Wide compatibility
})
```

### Modern-Only Library

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: false,  // No transformations
})
```

### Browser Component

```ts
export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm'],
  target: ['chrome100', 'safari15', 'firefox100'],
  platform: 'browser',
})
```

## CSS Targeting

When `@tsdown/css` is installed and a browser target is set, CSS syntax is also lowered automatically:

```ts
export default defineConfig({
  target: 'chrome108',  // CSS nesting will be flattened
})
```

See [CSS](option-css.md) for full CSS configuration options.

## Tips

1. **Let tsdown auto-detect** from package.json when possible
2. **Use `false`** for modern-only builds
3. **Specify multiple targets** for broader compatibility
4. **Use legacy decorators** with `experimentalDecorators`
5. **Install `@tsdown/css`** for CSS support and syntax lowering
6. **Test output** in target environments

## Related Options

- [Platform](option-platform.md) - Runtime environment
- [Output Format](option-output-format.md) - Module formats
- [Minification](option-minification.md) - Code optimization
- [CSS](option-css.md) - CSS handling and preprocessors
