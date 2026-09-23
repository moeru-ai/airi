# Output Directory Cleaning

Control how the output directory is cleaned before builds.

## Overview

By default, tsdown **cleans the output directory** before each build to remove stale files from previous builds.

## Basic Usage

### CLI

```bash
# Clean enabled (default)
tsdown

# Disable cleaning
tsdown --no-clean
```

### Config File

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  clean: true,  // Default
})
```

## Behavior

### With Cleaning (Default)

Before each build:
1. All files in `outDir` are removed
2. Fresh build starts with empty directory
3. Only current build outputs remain

**Benefits:**
- No stale files
- Predictable output
- Clean slate each build

### Without Cleaning

Build outputs are added to existing files:

```ts
export default defineConfig({
  clean: false,
})
```

**Use when:**
- Multiple builds to same directory
- Incremental builds
- Preserving other files
- Watch mode (faster rebuilds)

## Common Patterns

### Production Build

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  clean: true,  // Ensure clean output
  minify: true,
})
```

### Development Mode

```ts
export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  clean: !options.watch,  // Don't clean in watch mode
  sourcemap: options.watch,
}))
```

### Multiple Builds

```ts
export default defineConfig([
  {
    entry: ['src/index.ts'],
    outDir: 'dist',
    clean: true,  // Clean once
  },
  {
    entry: ['src/cli.ts'],
    outDir: 'dist',
    clean: false,  // Don't clean, add to same dir
  },
])
```

### Monorepo Package

```ts
export default defineConfig({
  workspace: 'packages/*',
  entry: ['src/index.ts'],
  clean: true,  // Clean each package's dist
})
```

### Preserve Static Files

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  clean: false,  // Keep manually added files
  outDir: 'dist',
})

// Manually copy files first
// Then run tsdown --no-clean
```

## Clean Patterns

### Selective Cleaning

```ts
import { rmSync } from 'fs'

export default defineConfig({
  clean: false,  // Disable auto clean
  hooks: {
    'build:prepare': () => {
      // Custom cleaning logic
      rmSync('dist/*.js', { force: true })
      // Keep other files
    },
  },
})
```

### Clean Specific Directories

```ts
export default defineConfig({
  clean: false,
  hooks: {
    'build:prepare': async () => {
      const { rm } = await import('fs/promises')
      // Only clean specific subdirectories
      await rm('dist/esm', { recursive: true, force: true })
      await rm('dist/cjs', { recursive: true, force: true })
      // Keep dist/types
    },
  },
})
```

## Watch Mode Behavior

In watch mode, cleaning behavior is important:

### Clean on First Build Only

```ts
export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  watch: options.watch,
  clean: !options.watch,  // Only clean initial build
}))
```

**Result:**
- First build: Clean
- Subsequent rebuilds: Incremental

### Always Clean

```ts
export default defineConfig({
  watch: true,
  clean: true,  // Clean every rebuild
})
```

**Trade-off:** Slower rebuilds, but always fresh output.

## Tips

1. **Leave enabled** for production builds
2. **Disable in watch mode** for faster rebuilds
3. **Use multiple configs** carefully with cleaning
4. **Custom clean logic** via hooks if needed
5. **Be cautious** - cleaning removes ALL files in outDir
6. **Test cleaning** - ensure no important files are lost

## Troubleshooting

### Important Files Deleted

- Don't put non-build files in outDir
- Use separate directory for static files
- Disable cleaning and manage manually

### Stale Files in Output

- Enable cleaning: `clean: true`
- Or manually remove before build

### Slow Rebuilds in Watch

- Disable cleaning in watch mode
- Use incremental builds

## CLI Examples

```bash
# Default (clean enabled)
tsdown

# Disable cleaning
tsdown --no-clean

# Watch mode without cleaning
tsdown --watch --no-clean

# Multiple formats with cleaning
tsdown --format esm,cjs --clean
```

## Examples

### Safe Production Build

```bash
# Clean before build
rm -rf dist
tsdown --clean
```

### Incremental Development

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  watch: true,
  clean: false,  // Faster rebuilds
  sourcemap: true,
})
```

### Multi-Stage Build

```ts
// Stage 1: Clean and build main
export default defineConfig([
  {
    entry: ['src/index.ts'],
    outDir: 'dist',
    clean: true,
  },
  {
    entry: ['src/utils.ts'],
    outDir: 'dist',
    clean: false,  // Add to same directory
  },
])
```

## Related Options

- [Output Directory](option-output-directory.md) - Configure outDir
- [Watch Mode](option-watch-mode.md) - Development workflow
- [Hooks](advanced-hooks.md) - Custom clean logic
- [Entry](option-entry.md) - Entry points
