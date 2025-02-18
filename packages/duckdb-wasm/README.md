# Easy to use `@duckdb/duckdb-wasm` wrapper for both browser and Node.js environments

> [Playground](https://drizzle-orm-duckdb-wasm.netlify.app/)

## Installation

Pick the package manager of your choice:

```shell
ni @proj-airi/duckdb-wasm -D # from @antfu/ni, can be installed via `npm i -g @antfu/ni`
pnpm i @proj-airi/duckdb-wasm -D
yarn i @proj-airi/duckdb-wasm -D
npm i @proj-airi/duckdb-wasm -D
```

## Usage

### Browser

```html
<script setup lang="ts">
  import type { DuckDBWasmClient } from '@proj-airi/duckdb-wasm'

  import { connect, getEnvironment } from '@proj-airi/duckdb-wasm'
  import { getImportUrlBundles } from '@proj-airi/duckdb-wasm/bundles/import-url-browser'
  import { onMounted, onUnmounted, ref } from 'vue'

  const db = ref<DuckDBWasmClient>()

  onMounted(async () => {
    db.value = await connect({ bundles: getImportUrlBundles })
    const result = await db.value.conn.query('SELECT 1 + 1 AS res')
    console.log(result) // Output: [{ res: 2 }]
  })

  onUnmounted(() => {
    db.value?.close()
  })
</script>
```

### Node.js

You will need to install `web-worker` too.

```shell
ni web-worker # from @antfu/ni, can be installed via `npm i -g @antfu/ni`
pnpm i web-worker
yarn i web-worker
npm i web-worker
```

```typescript
import { connect, getEnvironment } from '@proj-airi/duckdb-wasm'
import { getImportUrlBundles } from '@proj-airi/duckdb-wasm/bundles/default-node'

async function main() {
  const { conn, close } = await connect({ bundles: getImportUrlBundles })
  const result = await conn.query('SELECT 1 + 1 AS res')
  console.log(result) // Output: [{ res: 2 }]

  await close()
}
```

## Footnotes

Check out the [Drizzle ORM driver](https://github.com/moeru-ai/airi/blob/main/packages/drizzle-duckdb-wasm/README.md) we made for `@duckdb/duckdb-wasm` as welL!
