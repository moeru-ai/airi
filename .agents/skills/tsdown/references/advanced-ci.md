# CI Environment Support

Automatically detect CI environments and toggle features based on local vs CI builds.

## Overview

tsdown detects CI from the `CI` environment variable. CI mode is enabled when `process.env.CI` is set to a value other than `0` or `false` (case-insensitive).

## CI-Aware Values

Several options accept CI-aware string values:

| Value | Behavior |
|-------|----------|
| `true` | Always enabled |
| `false` | Always disabled |
| `'ci-only'` | Enabled only in CI, disabled locally |
| `'local-only'` | Enabled only locally, disabled in CI |

## Supported Options

These options accept CI-aware values:

- `dts` - TypeScript declaration file generation
- `publint` - Package lint validation
- `attw` - "Are the types wrong" validation
- `report` - Bundle size reporting
- `exports` - Auto-generate `package.json` exports
- `unused` - Unused dependency check
- `devtools` - DevTools integration
- `failOnWarn` - Fail on warnings (defaults to `false`)

## Usage

### String Form

```ts
export default defineConfig({
  dts: 'local-only',        // Skip DTS in CI for faster builds
  publint: 'ci-only',       // Only run publint in CI
  failOnWarn: 'ci-only',    // Fail on warnings in CI only (opt-in)
})
```

### Object Form

When an option takes a configuration object, set `enabled` to a CI-aware value:

```ts
export default defineConfig({
  publint: {
    enabled: 'ci-only',
    level: 'error',
  },
  attw: {
    enabled: 'ci-only',
    profile: 'node16',
  },
})
```

### Config Function

The config function receives a `ci` boolean in its context:

```ts
export default defineConfig((_, { ci }) => ({
  minify: ci,
  sourcemap: !ci,
}))
```

## Typical CI Configuration

```ts
export default defineConfig({
  entry: 'src/index.ts',
  format: ['esm', 'cjs'],
  dts: true,
  failOnWarn: 'ci-only',
  publint: 'ci-only',
  attw: 'ci-only',
})
```

## Related Options

- [Package Validation](option-lint.md) - publint and attw configuration
- [Log Level](option-log-level.md) - `failOnWarn` option details
