# Watch Mode

Automatically rebuild when files change.

## Overview

Watch mode monitors your source files and rebuilds automatically on changes, streamlining the development workflow.

## Basic Usage

### CLI

```bash
# Watch all project files
tsdown --watch

# Or use short flag
tsdown -w

# Watch specific directory
tsdown --watch ./src

# Watch specific file
tsdown --watch ./src/index.ts
```

### Config File

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  watch: true,
})
```

## Watch Options

### Ignore Paths

Ignore specific paths in watch mode:

```bash
tsdown --watch --ignore-watch test --ignore-watch '**/*.test.ts'
```

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  watch: {
    exclude: ['test/**', '**/*.test.ts'],
  },
})
```

### On Success Command

Run command after successful build:

```bash
tsdown --watch --on-success "echo Build complete!"
tsdown --watch --on-success "node dist/index.mjs"
```

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  watch: true,
  onSuccess: 'node dist/index.mjs',
})
```

## Watch Behavior

### Default Watch Targets

By default, tsdown watches:
- All entry files
- All imported files
- Config file (triggers restart)

### File Change Handling

- **Source files** - Incremental rebuild
- **Config file** - Full restart with cache clear
- **Dependencies** - Rebuild if imported

### Keyboard Shortcuts

During watch mode:
- `r` - Manual rebuild
- `q` - Quit watch mode

## Common Patterns

### Development Mode

```ts
export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm'],
  watch: options.watch,
  sourcemap: options.watch,
  minify: !options.watch,
}))
```

### With Post-Build Script

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  watch: true,
  onSuccess: 'npm run test',
})
```

### Multiple Entry Points

```ts
export default defineConfig({
  entry: {
    main: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  watch: true,
  clean: false,  // Don't clean on each rebuild
})
```

### Test Runner Integration

```bash
# Watch and run tests on change
tsdown --watch --on-success "vitest run"

# Watch and start dev server
tsdown --watch --on-success "node dist/server.mjs"
```

### Monorepo Package

```ts
export default defineConfig({
  workspace: 'packages/*',
  entry: ['src/index.ts'],
  watch: true,
  watch: {
    exclude: ['**/test/**', '**/*.spec.ts'],
  },
})
```

## Advanced Configuration

### Custom Watch Options

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  watch: {
    include: ['src/**'],
    exclude: ['**/*.test.ts', '**/fixtures/**'],
    skipWrite: false,
  },
})
```

### Conditional Watch

```ts
export default defineConfig((options) => {
  const isDev = options.watch

  return {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: !isDev,        // Skip DTS in watch mode
    sourcemap: isDev,
    clean: !isDev,
  }
})
```

## CLI Examples

```bash
# Basic watch
tsdown -w

# Watch with source maps
tsdown -w --sourcemap

# Watch without cleaning
tsdown -w --no-clean

# Watch and run on success
tsdown -w --on-success "npm test"

# Watch specific format
tsdown -w --format esm

# Watch with minification
tsdown -w --minify

# Watch and ignore test files
tsdown -w --ignore-watch '**/*.test.ts'
```

## Tips

1. **Use watch mode** for active development
2. **Skip DTS generation** in watch for faster rebuilds
3. **Disable clean** to avoid unnecessary file operations
4. **Use onSuccess** for post-build tasks
5. **Ignore test files** to avoid unnecessary rebuilds
6. **Use keyboard shortcuts** for manual control

## Troubleshooting

### Watch Not Detecting Changes

- Check file is in entry or imported chain
- Verify path is not in `exclude` patterns
- Ensure file system supports watching

### Too Many Rebuilds

Add ignore patterns:

```ts
export default defineConfig({
  watch: {
    exclude: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/*.test.ts',
    ],
  },
})
```

### Slow Rebuilds

- Skip DTS in watch mode: `dts: !options.watch`
- Disable minification: `minify: false`
- Use smaller entry set during development

### Config Changes Not Applied

Config file changes trigger full restart automatically.

### Why Not Stub Mode?

tsdown does not support stub mode. Watch mode is the recommended alternative for rapid development, providing instant rebuilds without the drawbacks of stub mode.

## Related Options

- [On Success](reference-cli.md#on-success-command) - Post-build commands
- [Sourcemap](option-sourcemap.md) - Debug information
- [Clean](option-cleaning.md) - Output directory cleaning
