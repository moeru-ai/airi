# Root Directory

Specify the root directory of input files for output structure mapping.

## Overview

The `root` option is similar to TypeScript's `rootDir`. It determines how entry file paths map to output paths. By default, tsdown computes the root as the common base directory of all entry files. Setting `root` explicitly lets you override this behavior.

## Basic Usage

### CLI

```bash
tsdown --root src
```

### Config File

```ts
export default defineConfig({
  entry: ['src/index.ts', 'src/utils/helper.ts'],
  root: 'src',
})
```

## How It Works

### Default

Given entries `src/index.ts` and `src/utils/helper.ts`, the common base directory is `src/`:

```
dist/
├── index.js
└── utils/
    └── helper.js
```

### With `root: '.'`

Setting root to the project directory preserves the `src/` prefix:

```
dist/
└── src/
    ├── index.js
    └── utils/
        └── helper.js
```

## What It Affects

1. **Entry name resolution** — Array entry paths are computed relative to `root` for output filenames
2. **Unbundle mode** — Used as `preserveModulesRoot`, controlling output structure when `unbundle: true`

## When to Use

- Auto-computed common base directory doesn't produce desired output structure
- Need to include or exclude directory prefixes in output paths
- Unbundle mode needs specific directory mapping

## Common Patterns

### Library with `src/` Prefix Preserved

```ts
export default defineConfig({
  entry: ['src/**/*.ts', '!**/*.test.ts'],
  root: '.',
  unbundle: true,
})
```

### Monorepo Package

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  root: 'src',
  unbundle: true,
})
```

## Related Options

- [Unbundle](option-unbundle.md) - Preserve directory structure
- [Entry](option-entry.md) - Entry point configuration
- [Output Directory](option-output-directory.md) - Output location
