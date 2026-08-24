# Entry Points

Configure which files to bundle as entry points.

## Overview

Entry points are the starting files for the bundling process. Each entry point generates a separate bundle.

## Usage Patterns

### CLI

```bash
# Single entry
tsdown src/index.ts

# Multiple entries
tsdown src/index.ts src/cli.ts

# Glob patterns
tsdown 'src/*.ts'
```

### Config File

#### Single Entry

```ts
export default defineConfig({
  entry: 'src/index.ts',
})
```

#### Multiple Entries (Array)

```ts
export default defineConfig({
  entry: ['src/entry1.ts', 'src/entry2.ts'],
})
```

#### Named Entries (Object)

```ts
export default defineConfig({
  entry: {
    main: 'src/index.ts',
    utils: 'src/utils.ts',
    cli: 'src/cli.ts',
  },
})
```

Output files will match the keys:
- `dist/main.mjs`
- `dist/utils.mjs`
- `dist/cli.mjs`

## Glob Patterns

Match multiple files dynamically using glob patterns:

### All TypeScript Files

```ts
export default defineConfig({
  entry: 'src/**/*.ts',
})
```

### Exclude Test Files

```ts
export default defineConfig({
  entry: ['src/*.ts', '!src/*.test.ts'],
})
```

### Object Entries with Glob Patterns

Use glob wildcards (`*`) in both keys and values. The `*` in the key acts as a placeholder replaced with the matched file name (without extension):

```ts
export default defineConfig({
  entry: {
    // Maps src/foo.ts → dist/lib/foo.js, src/bar.ts → dist/lib/bar.js
    'lib/*': 'src/*.ts',
  },
})
```

#### Negation Patterns in Object Entries

Values can be an array with negation patterns (`!`):

```ts
export default defineConfig({
  entry: {
    'hooks/*': ['src/hooks/*.ts', '!src/hooks/index.ts'],
  },
})
```

Multiple positive and negation patterns:

```ts
export default defineConfig({
  entry: {
    'utils/*': [
      'src/utils/*.ts',
      'src/utils/*.tsx',
      '!src/utils/index.ts',
      '!src/utils/internal.ts',
    ],
  },
})
```

**Warning:** Multiple positive patterns in an array value must share the same base directory.

### Mixed Entries

Mix strings, glob patterns, and object entries in an array:

```ts
export default defineConfig({
  entry: [
    'src/*',
    '!src/foo.ts',
    { main: 'index.ts' },
    { 'lib/*': ['src/*.ts', '!src/bar.ts'] },
  ],
})
```

Object entries take precedence when output names conflict.

### Windows Compatibility

Use forward slashes `/` instead of backslashes `\` on Windows:

```ts
// ✅ Correct
entry: 'src/utils/*.ts'

// ❌ Wrong on Windows
entry: 'src\\utils\\*.ts'
```

## Common Patterns

### Library with Main Export

```ts
export default defineConfig({
  entry: 'src/index.ts',
  format: ['esm', 'cjs'],
  dts: true,
})
```

### Library with Multiple Exports

```ts
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    client: 'src/client.ts',
    server: 'src/server.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
})
```

### CLI Tool

```ts
export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
  },
  format: ['esm'],
  platform: 'node',
})
```

### Preserve Directory Structure

Use with `unbundle: true` to keep file structure:

```ts
export default defineConfig({
  entry: ['src/**/*.ts', '!**/*.test.ts'],
  unbundle: true,
  format: ['esm'],
  dts: true,
})
```

This will output files matching the source structure:
- `src/index.ts` → `dist/index.mjs`
- `src/utils/helper.ts` → `dist/utils/helper.mjs`

## Tips

1. **Use glob patterns** for multiple related files
2. **Use object syntax** for custom output names
3. **Exclude test files** with negation patterns `!**/*.test.ts`
4. **Combine with unbundle** to preserve directory structure
5. **Use named entries** for better control over output filenames
