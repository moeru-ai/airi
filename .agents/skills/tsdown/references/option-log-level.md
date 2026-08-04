# Log Level

Control the verbosity of build output.

## Overview

The `logLevel` option controls how much information tsdown displays during the build process.

## Type

```ts
logLevel?: 'silent' | 'error' | 'warn' | 'info'
```

**Default:** `'info'`

## Basic Usage

### CLI

```bash
# Suppress all output
tsdown --log-level silent

# Only show errors
tsdown --log-level error

# Show warnings and errors
tsdown --log-level warn

# Show all info (default)
tsdown --log-level info
```

### Config File

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  logLevel: 'error',
})
```

## Available Levels

| Level | Shows | Use Case |
|-------|-------|----------|
| `silent` | Nothing | CI/CD pipelines, scripting |
| `error` | Errors only | Minimal output |
| `warn` | Warnings + errors | Standard CI/CD |
| `info` | All messages | Development (default) |

## Common Patterns

### CI/CD Pipeline

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  logLevel: 'error',  // Only show errors in CI
})
```

### Scripting

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  logLevel: 'silent',  // No output for automation
})
```

## Fail on Warnings

The `failOnWarn` option controls whether warnings cause the build to exit with a non-zero code. Defaults to `false` — warnings never fail the build.

```ts
export default defineConfig({
  failOnWarn: false,     // Default: never fail on warnings
  // failOnWarn: true,   // Always fail on warnings
  // failOnWarn: 'ci-only', // Fail on warnings only in CI
})
```

See [CI Environment](advanced-ci.md) for more about CI-aware options.

## Related Options

- [CI Environment](advanced-ci.md) - CI-aware option details
- [CLI Reference](reference-cli.md) - All CLI options
- [Config File](option-config-file.md) - Configuration setup
