# Getting Started

Quick guide to installing and using tsdown for the first time.

## Installation

Install tsdown as a development dependency:

```bash
pnpm add -D tsdown

# Optionally install TypeScript if not using isolatedDeclarations
pnpm add -D typescript
```

**Requirements:**
- Node.js 22.18.0 or higher **to run tsdown** (build-time only)
- Experimental support for Deno and Bun

> [!NOTE]
> The Node.js 22.18+ requirement only applies to the environment that runs `tsdown` itself. The **bundled output** can target much lower Node.js versions via the [`target`](./option-target.md) option, so libraries built with tsdown are not locked to Node.js 22+ at runtime.
>
> If your package needs to support Node.js 18 / 20, the recommended workflow is to **build with Node.js 22+ in CI**, then **test the built output (or the packed tarball) against the lower Node.js versions** you intend to support.

## Quick Start Templates

Use `create-tsdown` CLI for instant setup:

```bash
pnpm create tsdown@latest
```

Provides templates for:
- Pure TypeScript libraries
- React component libraries
- Vue component libraries
- Ready-to-use configurations

## First Bundle

### 1. Create Source Files

```ts
// src/index.ts
import { hello } from './hello.ts'
hello()

// src/hello.ts
export function hello() {
  console.log('Hello tsdown!')
}
```

### 2. Create Config File

```ts
// tsdown.config.ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts'],
})
```

### 3. Run Build

```bash
./node_modules/.bin/tsdown
```

Output: `dist/index.mjs`

### 4. Test Output

```bash
node dist/index.mjs
# Output: Hello tsdown!
```

## Add to npm Scripts

```json
{
  "scripts": {
    "build": "tsdown"
  }
}
```

Run with:

```bash
pnpm build
```

## CLI Commands

```bash
# Check version
tsdown --version

# View help
tsdown --help

# Build with watch mode
tsdown --watch

# Build with specific format
tsdown --format esm,cjs

# Generate type declarations
tsdown --dts
```

## Basic Configurations

### TypeScript Library (ESM + CJS)

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
})
```

### Browser Library (IIFE)

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['iife'],
  globalName: 'MyLib',
  platform: 'browser',
  minify: true,
})
```

### Multiple Entry Points

```ts
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    utils: 'src/utils.ts',
    cli: 'src/cli.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
})
```

## Using Plugins

Add Rolldown, Rollup, or Unplugin plugins:

```ts
import SomePlugin from 'some-plugin'

export default defineConfig({
  entry: ['src/index.ts'],
  plugins: [SomePlugin()],
})
```

## Watch Mode

Enable automatic rebuilds on file changes:

```bash
tsdown --watch
# or
tsdown -w
```

## Next Steps

- Configure [entry points](option-entry.md) with glob patterns
- Set up [multiple output formats](option-output-format.md)
- Enable [type declaration generation](option-dts.md)
- Explore [plugins](advanced-plugins.md) for extended functionality
- Read [migration guide](guide-migrate-from-tsup.md) if coming from tsup
