# WASM Support

Bundle WebAssembly modules in your TypeScript/JavaScript project.

## Overview

tsdown supports WASM through [`rolldown-plugin-wasm`](https://github.com/sxzz/rolldown-plugin-wasm), enabling direct `.wasm` imports with synchronous and asynchronous instantiation.

## Setup

### Install

```bash
pnpm add -D rolldown-plugin-wasm
```

### Configure

```ts
import { wasm } from 'rolldown-plugin-wasm'
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts'],
  plugins: [wasm()],
})
```

### TypeScript Support

Add type declarations to `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "types": ["rolldown-plugin-wasm/types"]
  }
}
```

## Importing WASM Modules

### Direct Import

```ts
import { add } from './add.wasm'
add(1, 2)
```

### Async Init

Use `?init` query for async initialization:

```ts
import init from './add.wasm?init'
const instance = await init(imports) // imports optional
instance.exports.add(1, 2)
```

### Sync Init

Use `?init&sync` query for synchronous initialization:

```ts
import initSync from './add.wasm?init&sync'
const instance = initSync(imports) // imports optional
instance.exports.add(1, 2)
```

## wasm-bindgen Support

### Target `bundler` (Recommended)

```ts
import { add } from 'some-pkg'
add(1, 2)
```

### Target `web` (Node.js)

```ts
import { readFile } from 'node:fs/promises'
import init, { add } from 'some-pkg'
import wasmUrl from 'some-pkg/add_bg.wasm?url'

await init({
  module_or_path: readFile(new URL(wasmUrl, import.meta.url)),
})
add(1, 2)
```

### Target `web` (Browser)

```ts
import init, { add } from 'some-pkg/add.js'
import wasmUrl from 'some-pkg/add_bg.wasm?url'

await init({ module_or_path: wasmUrl })
add(1, 2)
```

`nodejs` and `no-modules` wasm-bindgen targets are not supported.

## Plugin Options

```ts
wasm({
  maxFileSize: 14 * 1024, // Max size for inline (default: 14KB)
  fileName: '[hash][extname]', // Output file name pattern
  targetEnv: 'auto',      // 'auto' | 'auto-inline' | 'browser' | 'node'
})
```

| Option | Default | Description |
|--------|---------|-------------|
| `maxFileSize` | `14 * 1024` | Max file size for inlining. Set to `0` to always copy. |
| `fileName` | `'[hash][extname]'` | Pattern for emitted WASM files |
| `targetEnv` | `'auto'` | `'auto'` detects at runtime; `'browser'` omits Node builtins; `'node'` omits fetch |

## Related Options

- [Plugins](advanced-plugins.md) - Plugin system overview
- [Platform](option-platform.md) - Target platform configuration
