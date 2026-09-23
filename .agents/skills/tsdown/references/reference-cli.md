# CLI Reference

Complete reference for tsdown command-line interface.

## Overview

All CLI flags can also be set in the config file. CLI flags override config file options.

## Flag Patterns

CLI flag mapping rules:
- `--foo` sets `foo: true`
- `--no-foo` sets `foo: false`
- `--foo.bar` sets `foo: { bar: true }`
- `--format esm --format cjs` sets `format: ['esm', 'cjs']`

CLI flags support both camelCase and kebab-case. For example, `--outDir` and `--out-dir` are equivalent.

## Basic Commands

### Build

```bash
# Build with default config
tsdown

# Build specific files
tsdown src/index.ts src/cli.ts

# Build with watch mode
tsdown --watch
```

## Configuration

### `--config, -c <filename>`

Specify custom config file:

```bash
tsdown --config build.config.ts
tsdown -c custom-config.js
```

### `--no-config`

Disable config file loading:

```bash
tsdown --no-config src/index.ts
```

### `--config-loader <loader>`

Choose config loader (`auto`, `native`, `unrun`):

```bash
tsdown --config-loader unrun
```

### `--tsconfig <file>`

Specify TypeScript config file:

```bash
tsdown --tsconfig tsconfig.build.json
```

## Entry Points

### `[...files]`

Specify entry files as arguments:

```bash
tsdown src/index.ts src/utils.ts
```

## Output Options

### `--format <format>`

Output format (`esm`, `cjs`, `iife`, `umd`):

```bash
tsdown --format esm
tsdown --format esm --format cjs
```

### `--out-dir, -d <dir>`

Output directory:

```bash
tsdown --out-dir lib
tsdown -d dist
```

### `--dts`

Generate TypeScript declarations:

```bash
tsdown --dts
```

### `--clean`

Clean output directory before build:

```bash
tsdown --clean
```

## Build Options

### `--target <target>`

JavaScript target version:

```bash
tsdown --target es2020
tsdown --target node18
tsdown --target chrome100
tsdown --no-target  # Disable transformations
```

### `--platform <platform>`

Target platform (`node`, `browser`, `neutral`):

```bash
tsdown --platform node
tsdown --platform browser
```

### `--minify`

Enable minification:

```bash
tsdown --minify
tsdown --no-minify
```

### `--sourcemap`

Generate source maps:

```bash
tsdown --sourcemap
tsdown --sourcemap inline
```

### `--treeshake`

Enable/disable tree shaking:

```bash
tsdown --treeshake
tsdown --no-treeshake
```

## Dependencies

### `--deps.never-bundle <module>`

Mark module as external (not bundled):

```bash
tsdown --deps.never-bundle react --deps.never-bundle react-dom
```

### `--deps.skip-node-modules-bundle`

Skip resolving and bundling all node_modules:

```bash
tsdown --deps.skip-node-modules-bundle
```

### `--shims`

Add ESM/CJS compatibility shims:

```bash
tsdown --shims
```

## Development

### `--watch, -w [path]`

Enable watch mode:

```bash
tsdown --watch
tsdown -w
tsdown --watch src  # Watch specific directory
```

### `--ignore-watch <path>`

Ignore paths in watch mode:

```bash
tsdown --watch --ignore-watch test
```

### `--on-success <command>`

Run command after successful build:

```bash
tsdown --watch --on-success "echo Build complete!"
```

## Environment Variables

### `--env.* <value>`

Set compile-time environment variables:

```bash
tsdown --env.NODE_ENV=production --env.API_URL=https://api.example.com
```

Access as `import.meta.env.*` or `process.env.*`.

### `--env-file <file>`

Load environment variables from file:

```bash
tsdown --env-file .env.production
```

### `--env-prefix <prefix>`

Filter environment variables by prefix (default: `TSDOWN_`):

```bash
tsdown --env-file .env --env-prefix APP_ --env-prefix TSDOWN_
```

## Assets

### `--copy <dir>`

Copy directory to output:

```bash
tsdown --copy public
tsdown --copy assets --copy static
```

## Executable

### `--exe`

**[experimental]** Bundle as a standalone executable using [Node.js Single Executable Applications](https://nodejs.org/api/single-executable-applications.html). Requires Node.js >= 25.5.0, not supported in Bun or Deno. Cross-platform builds supported via `@tsdown/exe`.

```bash
tsdown --exe
```

When enabled:
- Default format changes to `cjs` (unless Node.js >= 25.7.0)
- Declaration file generation (`dts`) is disabled by default
- Code splitting is disabled
- Only single entry points are supported

See [Executable](option-exe.md) for advanced configuration and cross-platform builds.

## Package Management

### `--exports`

Generate the `exports` field in package.json:

```bash
tsdown --exports
```

### `--publint`

Enable package validation:

```bash
tsdown --publint
```

### `--attw`

Enable "Are the types wrong" validation:

```bash
tsdown --attw
```

### `--unused`

Check for unused dependencies:

```bash
tsdown --unused
```

## Logging

### `--log-level <level>`

Set logging verbosity (`silent`, `error`, `warn`, `info`):

```bash
tsdown --log-level error
tsdown --log-level warn
```

### `--report` / `--no-report`

Enable/disable build report:

```bash
tsdown --no-report  # Disable size report
tsdown --report     # Enable (default)
```

### `--debug [feat]`

Show debug logs:

```bash
tsdown --debug
tsdown --debug rolldown  # Debug specific feature
```

## Integration

### `--from-vite [vitest]`

Extend Vite or Vitest config:

```bash
tsdown --from-vite         # Use vite.config.*
tsdown --from-vite vitest  # Use vitest.config.*
```

## Workspace / Monorepo

### `--workspace, -W [dir]`

Enable workspace mode for building multiple packages:

```bash
tsdown -W
tsdown -W packages/
```

### `--filter, -F <pattern>`

Filter configs by name or working directory. Supports regex:

```bash
tsdown -W -F my-package
tsdown -W -F /^pkg-/
```

### `--unbundle`

Enable unbundle (bundleless) mode:

```bash
tsdown --unbundle
```

### `--root <dir>`

Specify the root directory of input files (similar to TypeScript's `rootDir`). Controls the output directory structure by determining how entry file paths map to output paths. Defaults to the common base directory of all entry files.

```bash
tsdown --root src
tsdown --root .
```

### `--fail-on-warn`

Fail on warnings (enabled by default):

```bash
tsdown --no-fail-on-warn  # Disable
```

## Common Usage Patterns

### Basic Build

```bash
tsdown
```

### Library (ESM + CJS + Types)

```bash
tsdown --format esm --format cjs --dts --clean
```

### Production Build

```bash
tsdown --minify --clean --no-report
```

### Development (Watch)

```bash
tsdown --watch --sourcemap
```

### Browser Bundle (IIFE)

```bash
tsdown --format iife --platform browser --minify
```

### Node.js CLI Tool

```bash
tsdown --format esm --platform node --shims
```

### Standalone Executable

```bash
tsdown src/cli.ts --exe
```

### Monorepo Package

```bash
tsdown --clean --dts --exports --publint
```

### With Environment Variables

```bash
tsdown --env-file .env.production --env.BUILD_TIME=$(date +%s)
```

### Copy Assets

```bash
tsdown --copy public --copy assets --clean
```

## Tips

1. **Use config file** for complex setups
2. **CLI flags override** config file options
3. **Chain multiple formats** for multi-target builds
4. **Use --clean** to avoid stale files
5. **Enable --dts** for TypeScript libraries
6. **Use --watch** during development
7. **Add --on-success** for post-build tasks
8. **Use --exports** to auto-generate package.json fields

## Related Documentation

- [Config File](option-config-file.md) - Configuration file options
- [Entry](option-entry.md) - Entry point configuration
- [Output Format](option-output-format.md) - Format options
- [Watch Mode](option-watch-mode.md) - Watch mode details
