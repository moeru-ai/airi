# Package Validation (publint & attw)

Validate your package configuration and type declarations before publishing.

## Overview

tsdown integrates with [publint](https://publint.dev/) and [Are the types wrong?](https://arethetypeswrong.github.io/) (attw) to catch common packaging issues. Both are optional dependencies.

## Installation

```bash
# publint only
npm install -D publint

# attw only
npm install -D @arethetypeswrong/core

# both
npm install -D publint @arethetypeswrong/core
```

## publint

Checks that `package.json` fields (`exports`, `main`, `module`, `types`) match your actual output files.

### Enable

```ts
export default defineConfig({
  publint: true,
})
```

### Configuration

```ts
export default defineConfig({
  publint: {
    level: 'error', // 'warning' | 'error' | 'suggestion'
  },
})
```

### CLI

```bash
tsdown --publint
```

## attw (Are the types wrong?)

Verifies TypeScript declarations are correct across different module resolution strategies (`node10`, `node16`, `bundler`).

### Enable

```ts
export default defineConfig({
  attw: true,
})
```

### Configuration

```ts
export default defineConfig({
  attw: {
    profile: 'node16',   // 'strict' | 'node16' | 'esm-only'
    level: 'error',       // 'warn' | 'error'
    ignoreRules: ['false-cjs', 'cjs-resolves-to-esm'],
  },
})
```

### Profiles

| Profile | Description |
|---------|-------------|
| `strict` | Requires all resolutions to pass (default) |
| `node16` | Ignores `node10` resolution failures |
| `esm-only` | Ignores `node10` and `node16-cjs` resolution failures |

### Ignore Rules

Suppress specific problem types with `ignoreRules`:

| Rule | Description |
|------|-------------|
| `no-resolution` | Module could not be resolved |
| `untyped-resolution` | Resolution succeeded but has no types |
| `false-cjs` | Types indicate CJS but implementation is ESM |
| `false-esm` | Types indicate ESM but implementation is CJS |
| `cjs-resolves-to-esm` | CJS resolution points to an ESM module |
| `fallback-condition` | A fallback/wildcard condition was used |
| `cjs-only-exports-default` | CJS module only exports a default |
| `named-exports` | Named exports mismatch between types and implementation |
| `false-export-default` | Types declare a default export that doesn't exist |
| `missing-export-equals` | Types are missing `export =` for CJS |
| `unexpected-module-syntax` | File uses unexpected module syntax |
| `internal-resolution-error` | Internal resolution error in type checking |

### CLI

```bash
tsdown --attw
```

## CI Integration

Both tools support CI-aware options:

```ts
export default defineConfig({
  publint: 'ci-only',
  attw: {
    enabled: 'ci-only',
    profile: 'node16',
    level: 'error',
  },
})
```

Both tools require a `package.json` in your project directory.

## Related Options

- [CI Environment](advanced-ci.md) - CI-aware option details
- [Package Exports](option-package-exports.md) - Generate exports field
