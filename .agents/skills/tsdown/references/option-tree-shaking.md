# Tree Shaking

Remove unused code from bundles.

## Overview

Tree shaking eliminates dead code (unused exports) from your final bundle, reducing size and improving performance.

**Default:** Enabled

## Basic Usage

### CLI

```bash
# Tree shaking enabled (default)
tsdown

# Disable tree shaking
tsdown --no-treeshake
```

### Config File

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  treeshake: true,  // Default
})
```

## How It Works

### With Tree Shaking

**Source:**
```ts
// src/util.ts
export function unused() {
  console.log("I'm unused")
}

export function hello(x: number) {
  console.log('Hello World', x)
}

// src/index.ts
import { hello } from './util'
hello(1)
```

**Output:**
```js
// dist/index.mjs
function hello(x) {
  console.log('Hello World', x)
}
hello(1)
```

`unused()` function is removed because it's never imported.

### Without Tree Shaking

**Output:**
```js
// dist/index.mjs
function unused() {
  console.log("I'm unused")
}

function hello(x) {
  console.log('Hello World', x)
}
hello(1)
```

All code is included, even if unused.

## Advanced Configuration

### Enable (Default)

```ts
export default defineConfig({
  treeshake: true,
})
```

Uses Rolldown's default tree shaking.

### Custom Options

```ts
export default defineConfig({
  treeshake: {
    moduleSideEffects: false,
    propertyReadSideEffects: false,
    unknownGlobalSideEffects: false,
  },
})
```

See [Rolldown docs](https://rolldown.rs/reference/InputOptions.treeshake#treeshake) for all options.

### Disable

```ts
export default defineConfig({
  treeshake: false,
})
```

## Side Effects

### Package.json sideEffects

Declare side effects in your package:

```json
{
  "sideEffects": false
}
```

Or specify files with side effects:

```json
{
  "sideEffects": ["*.css", "src/polyfills.ts"]
}
```

### Module Side Effects

```ts
export default defineConfig({
  treeshake: {
    moduleSideEffects: (id) => {
      // Preserve side effects for polyfills
      return id.includes('polyfill')
    },
  },
})
```

## Common Patterns

### Production Build

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  treeshake: true,
  minify: true,
})
```

### Development Build

```ts
export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  treeshake: !options.watch,  // Disable in dev
}))
```

### Library with Side Effects

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  treeshake: {
    moduleSideEffects: (id) => {
      return (
        id.includes('.css') ||
        id.includes('polyfill') ||
        id.includes('side-effect')
      )
    },
  },
})
```

### Utilities Library

```ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  treeshake: true,
  dts: true,
})
```

Users can import only what they need:
```ts
import { onlyWhatINeed } from 'my-utils'
```

## Benefits

### Smaller Bundles

- Only includes imported code
- Removes unused functions, classes, variables
- Reduces download size

### Better Performance

- Less code to parse
- Faster execution
- Improved loading times

### Cleaner Output

- No dead code in production
- Easier to debug
- Better maintainability

## When to Disable

### Debugging

During development to see all code:

```ts
export default defineConfig((options) => ({
  treeshake: !options.watch,
}))
```

### Side Effect Code

Code with global side effects:

```ts
// This has side effects
window.myGlobal = {}

export function setup() {
  // ...
}
```

Disable tree shaking or mark side effects:

```json
{
  "sideEffects": true
}
```

### Testing

Include all code for coverage:

```ts
export default defineConfig({
  treeshake: false,
})
```

## Tips

1. **Leave enabled** for production builds
2. **Mark side effects** in package.json
3. **Use with minification** for best results
4. **Test tree shaking** - verify unused code is removed
5. **Disable for debugging** if needed
6. **Pure functions** are easier to tree shake

## Troubleshooting

### Code Still Included

- Check for side effects
- Verify imports are ES modules
- Ensure code is actually unused
- Check `sideEffects` in package.json

### Missing Code at Runtime

- Code has side effects but marked as none
- Set `sideEffects: true` or list specific files

### Unexpected Behavior

- Module has side effects not declared
- Try disabling tree shaking to isolate issue

## Examples

### Pure Utility Functions

```ts
// utils.ts - perfect for tree shaking
export function add(a, b) {
  return a + b
}

export function multiply(a, b) {
  return a * b
}

// Only 'add' imported = only 'add' bundled
import { add } from './utils'
```

### With Side Effects

```ts
// polyfill.ts - has side effects
if (!Array.prototype.at) {
  Array.prototype.at = function(index) {
    // polyfill implementation
  }
}

export {} // Need to export something
```

```json
{
  "sideEffects": ["src/polyfill.ts"]
}
```

## Related Options

- [Minification](option-minification.md) - Code compression
- [Target](option-target.md) - Syntax transformations
- [Dependencies](option-dependencies.md) - External packages
- [Output Format](option-output-format.md) - Module formats
