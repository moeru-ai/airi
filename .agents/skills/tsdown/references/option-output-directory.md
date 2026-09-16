# Output Directory

Configure the output directory for bundled files.

## Overview

By default, tsdown outputs bundled files to the `dist` directory. You can customize this location using the `outDir` option.

## Basic Usage

### CLI

```bash
# Default output to dist/
tsdown

# Custom output directory
tsdown --out-dir build
tsdown -d lib
```

### Config File

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'build',
})
```

## Common Patterns

### Standard Library

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  outDir: 'dist',  // Default
  dts: true,
})
```

**Output:**
```
dist/
├── index.mjs
├── index.cjs
└── index.d.ts
```

### Separate Directories by Format

```ts
export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    outDir: 'dist/esm',
  },
  {
    entry: ['src/index.ts'],
    format: ['cjs'],
    outDir: 'dist/cjs',
  },
])
```

**Output:**
```
dist/
├── esm/
│   └── index.js
└── cjs/
    └── index.js
```

### Monorepo Package

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',  // Custom directory
  clean: true,
})
```

### Build to Root

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: '.',  // Output to project root (not recommended)
  clean: false,  // Don't clean root!
})
```

**Warning:** Be careful when outputting to root to avoid deleting important files.

## Output Extensions

### Custom Extensions

Use `outExtensions` to control file extensions:

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  outDir: 'dist',
  outExtensions({ format }) {
    return {
      js: format === 'esm' ? '.mjs' : '.cjs',
    }
  },
})
```

### Default Extensions

| Format | Default Extension | With `type: "module"` |
|--------|-------------------|----------------------|
| `esm` | `.mjs` | `.js` |
| `cjs` | `.cjs` | `.js` |
| `iife` | `.iife.js` | `.iife.js` |
| `umd` | `.umd.js` | `.umd.js` |

For IIFE/UMD builds, `outExtensions` customizes extensions or suffixes but does not remove the built-in `.iife` or `.umd` segment. Use `outputOptions.entryFileNames` for custom full filename patterns.

### ESM with .js Extension

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  outExtensions: () => ({ js: '.js' }),
})
```

Requires `"type": "module"` in package.json.

## File Naming

### Entry Names

Control output filenames based on entry names:

```ts
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    utils: 'src/utils.ts',
  },
  outDir: 'dist',
})
```

**Output:**
```
dist/
├── index.mjs
└── utils.mjs
```

### Glob Entry

```ts
export default defineConfig({
  entry: ['src/**/*.ts', '!**/*.test.ts'],
  outDir: 'dist',
  unbundle: true,  // Preserve structure
})
```

**Output:**
```
dist/
├── index.mjs
├── utils/
│   └── helper.mjs
└── components/
    └── button.mjs
```

## Multiple Builds

### Same Output Directory

```ts
export default defineConfig([
  {
    entry: ['src/index.ts'],
    outDir: 'dist',
    clean: true,  // Clean first
  },
  {
    entry: ['src/cli.ts'],
    outDir: 'dist',
    clean: false,  // Don't clean again
  },
])
```

### Different Output Directories

```ts
export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    outDir: 'dist/lib',
  },
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    outDir: 'dist/bin',
  },
])
```

## CLI Examples

```bash
# Default
tsdown

# Custom directory
tsdown --out-dir build
tsdown -d lib

# Nested directory
tsdown --out-dir dist/lib

# With other options
tsdown --out-dir build --format esm,cjs --dts
```

## Tips

1. **Use default `dist`** for standard projects
2. **Be careful with root** - avoid `outDir: '.'`
3. **Clean before build** - use `clean: true`
4. **Consistent naming** - match your project conventions
5. **Separate by format** if needed for clarity
6. **Check .gitignore** - ensure output dir is ignored

## Troubleshooting

### Files Not in Expected Location

- Check `outDir` config
- Verify build completed successfully
- Look for typos in path

### Files Deleted Unexpectedly

- Check if `clean: true`
- Ensure outDir doesn't overlap with source
- Don't use root as outDir

### Permission Errors

- Check write permissions
- Ensure directory isn't locked
- Try different location

## Related Options

- [Cleaning](option-cleaning.md) - Clean output directory
- [Entry](option-entry.md) - Entry points
- [Output Format](option-output-format.md) - Module formats
- [Unbundle](option-unbundle.md) - Preserve structure
