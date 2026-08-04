# Shims

Add compatibility between ESM and CommonJS module systems.

## Overview

Shims provide small pieces of code that bridge the gap between CommonJS (CJS) and ECMAScript Modules (ESM), enabling cross-module-system compatibility.

## What Shims Provide

### ESM Output (when enabled)

With `shims: true`, adds CommonJS variables to ESM:

- `__dirname` - Current directory path
- `__filename` - Current file path

### ESM Output (automatic)

Always added when using `require` in ESM on Node.js:

- `require` function via `createRequire(import.meta.url)`

### CJS Output (automatic)

Always added to CommonJS output:

- `import.meta.url`
- `import.meta.dirname`
- `import.meta.filename`

## Usage

### CLI

```bash
tsdown --shims
```

### Config File

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  shims: true,
})
```

## Generated Code

### ESM with Shims

**Source:**
```ts
console.log(__dirname)
console.log(__filename)
```

**Output (shims: true):**
```js
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

console.log(__dirname)
console.log(__filename)
```

### ESM with require

**Source:**
```ts
const mod = require('some-module')
```

**Output (automatic on Node.js):**
```js
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const mod = require('some-module')
```

### CJS with import.meta

**Source:**
```ts
console.log(import.meta.url)
console.log(import.meta.dirname)
```

**Output (automatic):**
```js
const import_meta = {
  url: require('url').pathToFileURL(__filename).toString(),
  dirname: __dirname,
  filename: __filename
}

console.log(import_meta.url)
console.log(import_meta.dirname)
```

## Common Patterns

### Node.js CLI Tool

```ts
export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  platform: 'node',
  shims: true,  // Add __dirname, __filename
})
```

### Dual Format Library

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'node',
  shims: true,  // ESM gets __dirname/__filename
                // CJS gets import.meta.* (automatic)
})
```

### Server-Side Code

```ts
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  shims: true,
  deps: {
    neverBundle: [/.*/],  // External all deps
  },
})
```

### File System Operations

```ts
// Source code
import { readFileSync } from 'fs'
import { join } from 'path'

// Read file relative to current module
const content = readFileSync(join(__dirname, 'data.json'), 'utf-8')
```

```ts
// tsdown config
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  shims: true,  // Enables __dirname
})
```

## When to Use Shims

### Use `shims: true` when:

- ✅ Building Node.js tools/CLIs
- ✅ Code uses `__dirname` or `__filename`
- ✅ Need file system operations relative to module
- ✅ Migrating from CommonJS to ESM
- ✅ Need cross-format compatibility

### Don't need shims when:

- ❌ Browser-only code
- ❌ No file system operations
- ❌ Using only `import.meta.url`
- ❌ Pure ESM without CJS variables

## Performance Impact

### Runtime Overhead

Shims add minimal runtime overhead:

```js
// Added to output when shims enabled
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
```

### Tree Shaking

If `__dirname` or `__filename` are not used, they're automatically removed during bundling (no overhead).

## Platform Considerations

### Node.js Platform

```ts
export default defineConfig({
  platform: 'node',
  format: ['esm'],
  shims: true,  // Recommended for Node.js
})
```

- `require` shim added automatically
- `__dirname` and `__filename` available with `shims: true`

### Browser Platform

```ts
export default defineConfig({
  platform: 'browser',
  format: ['esm'],
  shims: false,  // Not needed for browser
})
```

- Shims not needed (no Node.js variables)
- Will cause warnings if Node.js APIs used

### Neutral Platform

```ts
export default defineConfig({
  platform: 'neutral',
  format: ['esm'],
  shims: false,  // Avoid platform-specific code
})
```

- Avoid shims for maximum portability

## CLI Examples

```bash
# Enable shims
tsdown --shims

# ESM with shims for Node.js
tsdown --format esm --platform node --shims

# Dual format with shims
tsdown --format esm --format cjs --shims
```

## Troubleshooting

### `__dirname is not defined`

Enable shims:

```ts
export default defineConfig({
  shims: true,
})
```

### `require is not defined` in ESM

Automatic on Node.js platform. If not working:

```ts
export default defineConfig({
  platform: 'node',  // Ensure Node.js platform
})
```

### Import.meta not working in CJS

Automatic - no configuration needed. If still failing, check output format:

```ts
export default defineConfig({
  format: ['cjs'],  // Shims added automatically
})
```

## Tips

1. **Enable for Node.js tools** - Use `shims: true` for CLIs and servers
2. **Skip for browsers** - Not needed for browser code
3. **No overhead if unused** - Automatically tree-shaken
4. **Automatic require shim** - No config needed for `require` in ESM
5. **CJS shims automatic** - `import.meta.*` always available in CJS

## Related Options

- [Platform](option-platform.md) - Runtime environment
- [Output Format](option-output-format.md) - Module formats
- [Target](option-target.md) - Syntax transformations
