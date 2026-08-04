# Configuration File

Centralize and manage build settings with a configuration file.

## Overview

tsdown searches for config files automatically in the current directory and parent directories.

## Supported File Names

tsdown looks for these files (in order):
- `tsdown.config.ts`
- `tsdown.config.mts`
- `tsdown.config.cts`
- `tsdown.config.js`
- `tsdown.config.mjs`
- `tsdown.config.cjs`
- `tsdown.config.json`
- `tsdown.config`
- `package.json` (in `tsdown` field)

## Basic Configuration

### TypeScript Config

```ts
// tsdown.config.ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
})
```

### JavaScript Config

```js
// tsdown.config.js
export default {
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
}
```

### JSON Config

```json
// tsdown.config.json
{
  "entry": ["src/index.ts"],
  "format": ["esm", "cjs"],
  "dts": true
}
```

### Package.json Config

```json
// package.json
{
  "name": "my-library",
  "tsdown": {
    "entry": ["src/index.ts"],
    "format": ["esm", "cjs"],
    "dts": true
  }
}
```

## Multiple Configurations

Build multiple outputs with different settings:

```ts
export default defineConfig([
  {
    entry: 'src/index.ts',
    format: ['esm', 'cjs'],
    platform: 'node',
    dts: true,
  },
  {
    entry: 'src/browser.ts',
    format: ['iife'],
    platform: 'browser',
    globalName: 'MyLib',
    minify: true,
  },
])
```

Each configuration runs as a separate build.

## Dynamic Configuration

Use a function for conditional config:

```ts
export default defineConfig((options) => {
  const isDev = options.watch

  return {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    minify: !isDev,
    sourcemap: isDev,
    clean: !isDev,
  }
})
```

Available options:
- `watch` - Whether watch mode is enabled
- Other CLI flags passed to config

## Config Loaders

Control how TypeScript config files are loaded:

### Auto Loader (Default)

Uses native TypeScript support if available, otherwise falls back to `unrun`:

```bash
tsdown # Uses auto loader
```

### Native Loader

Uses runtime's native TypeScript support (Node.js 22.18.0+, Bun, Deno):

```bash
tsdown --config-loader native
```

### tsx Loader

Uses [tsx](https://tsx.is/) library for loading via its tsImport API. Note: `tsx` is an optional peer dependency — install it manually first.

```bash
pnpm add -D tsx
tsdown --config-loader tsx
```

### Unrun Loader

Uses [unrun](https://gugustinette.github.io/unrun/) library for loading. Note: `unrun` is an optional peer dependency — install it manually first.

```bash
pnpm add -D unrun
tsdown --config-loader unrun
```

**Tip:** Use `tsx` or `unrun` loader if you need to load TypeScript configs without file extensions in Node.js.

## Custom Config Path

Specify a custom config file location:

```bash
tsdown --config ./configs/build.config.ts
# or
tsdown -c custom-config.ts
```

## Disable Config File

Ignore config files and use CLI options only:

```bash
tsdown --no-config src/index.ts --format esm
```

## Extend Vite/Vitest Config (Experimental)

Reuse existing Vite or Vitest configurations:

```bash
# Extend vite.config.*
tsdown --from-vite

# Extend vitest.config.*
tsdown --from-vite vitest
```

**Note:** Only specific options like `resolve` and `plugins` are reused. Test thoroughly as this feature is experimental.

## Workspace / Monorepo

Build multiple packages with a single config:

```ts
export default defineConfig({
  workspace: 'packages/*',
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
})
```

Each package directory matching the glob pattern will be built with the same configuration.

## Common Patterns

### Library with Multiple Builds

```ts
export default defineConfig([
  // Node.js build
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    platform: 'node',
    dts: true,
  },
  // Browser build
  {
    entry: ['src/browser.ts'],
    format: ['iife'],
    platform: 'browser',
    globalName: 'MyLib',
  },
])
```

### Development vs Production

```ts
export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  minify: !options.watch,
  sourcemap: options.watch ? true : false,
  clean: !options.watch,
}))
```

### Monorepo Root Config

```ts
// Root tsdown.config.ts
export default defineConfig({
  workspace: 'packages/*',
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  // Shared config for all packages
})
```

### Per-Package Override

```ts
// packages/special/tsdown.config.ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'], // Override: only ESM
  platform: 'browser', // Override: browser only
})
```

## Config Precedence

When multiple configs exist:

1. CLI options (highest priority)
2. Config file specified with `--config`
3. Auto-discovered config files
4. Package.json `tsdown` field
5. Default values

## Tips

1. **Use TypeScript config** for type checking and autocomplete
2. **Use defineConfig** helper for better DX
3. **Export arrays** for multiple build configurations
4. **Use functions** for dynamic/conditional configs
5. **Keep configs simple** - prefer convention over configuration
6. **Use workspace** for monorepo builds
7. **Test experimental features** thoroughly before production use

## Related Options

- [Entry](option-entry.md) - Configure entry points
- [Output Format](option-output-format.md) - Output formats
- [Watch Mode](option-watch-mode.md) - Watch mode configuration
