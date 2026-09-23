# Migrate from tsup

Migration guide for switching from tsup to tsdown.

## Overview

tsdown is built on Rolldown (Rust-based) vs tsup's esbuild, providing faster and more powerful bundling while maintaining compatibility.

## Automatic Migration

### Single Package

```bash
npx tsdown-migrate
```

### Monorepo

```bash
# Using glob patterns
npx tsdown-migrate packages/*

# Multiple directories
npx tsdown-migrate packages/foo packages/bar
```

### Migration Options

- `[...dirs]` - Directories to migrate (supports globs)
- `--dry-run` or `-d` - Preview changes without modifying files

**Important:** Commit your changes before running migration.

## Key Differences

### Default Values

| Option | tsup | tsdown |
|--------|------|--------|
| `format` | `['cjs']` | `['esm']` |
| `clean` | `false` | `true` |
| `dts` | `false` | Auto-enabled if `types`/`typings` in package.json |
| `target` | Manual | Auto-read from `engines.node` in package.json |

### Option Renames

| tsup | tsdown |
|------|--------|
| `outExtension` | `outExtensions` |

### Output Filename Differences

For IIFE builds, `tsdown` emits `[name].iife.js`; `tsup` commonly emitted `[name].global.js`. `outExtensions` customizes extensions or suffixes, but it does not remove `.iife` or `.umd`. Use `outputOptions.entryFileNames: '[name].global.js'` to preserve old IIFE filenames.

### New Features in tsdown

#### Node Protocol Control

```ts
export default defineConfig({
  nodeProtocol: true,      // Add node: prefix (fs → node:fs)
  nodeProtocol: 'strip',   // Remove node: prefix (node:fs → fs)
  nodeProtocol: false,     // Keep as-is (default)
})
```

#### Better Workspace Support

```ts
export default defineConfig({
  workspace: 'packages/*',  // Build all packages
})
```

## Migration Checklist

1. **Backup your code** - Commit all changes
2. **Run migration tool** - `npx tsdown-migrate`
3. **Review changes** - Check modified config files
4. **Update scripts** - Change `tsup` to `tsdown` in package.json
5. **Test build** - Run `pnpm build` to verify
6. **Adjust config** - Fine-tune based on your needs

## Common Migration Patterns

### Basic Library

**Before (tsup):**
```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
})
```

**After (tsdown):**
```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],  // ESM now default
  dts: true,
  clean: true,  // Now enabled by default
})
```

### With Custom Target

**Before (tsup):**
```ts
export default defineConfig({
  entry: ['src/index.ts'],
  target: 'es2020',
})
```

**After (tsdown):**
```ts
export default defineConfig({
  entry: ['src/index.ts'],
  // target auto-reads from package.json engines.node
  // Or override explicitly:
  target: 'es2020',
})
```

### CLI Scripts

**Before (package.json):**
```json
{
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch"
  }
}
```

**After (package.json):**
```json
{
  "scripts": {
    "build": "tsdown",
    "dev": "tsdown --watch"
  }
}
```

## Feature Compatibility

### Supported tsup Features

Most tsup features are supported:
- ✅ Multiple entry points
- ✅ Multiple formats (ESM, CJS, IIFE, UMD)
- ✅ TypeScript declarations
- ✅ Source maps
- ✅ Minification
- ✅ Watch mode
- ✅ External dependencies
- ✅ Tree shaking
- ✅ Shims
- ✅ Plugins (Rollup compatible)

### Missing Features

Some tsup features are not yet available. Check [GitHub issues](https://github.com/rolldown/tsdown/issues) for status and request features.

## Troubleshooting

### Build Fails After Migration

1. **Check Node.js version** - Requires Node.js 22.18.0+ to run tsdown itself. The bundled output can still target lower Node.js versions via `target`; if you need to support Node.js 18 / 20, build with Node.js 22+ in CI and test the produced output (or packed tarball) on the lower versions.
2. **Install TypeScript** - Required for DTS generation
3. **Review config changes** - Ensure format and options are correct
4. **Check dependencies** - Verify all dependencies are installed

### Different Output

- **Format order** - tsdown defaults to ESM first
- **Clean behavior** - tsdown cleans outDir by default
- **Target** - tsdown auto-detects from package.json

### Performance Issues

tsdown should be faster than tsup. If not:
1. Enable `isolatedDeclarations` for faster DTS generation
2. Check for large dependencies being bundled
3. Use `skipNodeModulesBundle` if needed

## Getting Help

- [GitHub Issues](https://github.com/rolldown/tsdown/issues) - Report bugs or request features
- [Documentation](https://tsdown.dev) - Full documentation
- [Migration Tool](https://github.com/rolldown/tsdown/tree/main/packages/migrate) - Source code

## Acknowledgements

tsdown is heavily inspired by tsup and incorporates parts of its codebase. Thanks to [@egoist](https://github.com/egoist) and the tsup community.
