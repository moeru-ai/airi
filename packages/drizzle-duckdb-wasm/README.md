# 🦆 Drizzle ORM driver for `@duckdb/duckdb-wasm`

This package provides a Drizzle ORM driver for the DuckDB WASM implementation.

> [Playground](https://drizzle-orm-duckdb-wasm.netlify.app/)

## Installation

Pick the package manager of your choice:

```shell
ni @proj-airi/drizzle-duckdb-wasm -D # from @antfu/ni, can be installed via `npm i -g @antfu/ni`
pnpm i @proj-airi/drizzle-duckdb-wasm -D
yarn i @proj-airi/drizzle-duckdb-wasm -D
npm i @proj-airi/drizzle-duckdb-wasm -D
```

## Usage

```typescript
import { drizzle } from '@proj-airi/drizzle-duckdb-wasm'

const db = drizzle('duckdb-wasm://?bundles=import-url', { schema })
```

### Browser

#### Vue.js

```typescript
// ./db/schema.ts
import { sql } from 'drizzle-orm'
import { pgTable, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable('users', () => ({
  id: uuid().primaryKey().unique().default(sql`gen_random_uuid()`),
}))
```

```shell
drizzle-kit generate
```

```html
<!-- ./src/App.vue -->
<script setup lang="ts">
  import type { DuckDBWasmDrizzleDatabase } from '@proj-airi/drizzle-duckdb-wasm'

  import { drizzle } from '@proj-airi/drizzle-duckdb-wasm'
  import { getImportUrlBundles } from '@proj-airi/drizzle-duckdb-wasm/bundles/import-url-browser'
  import { useDebounceFn } from '@vueuse/core'
  import { serialize } from 'superjson'
  import { onMounted, onUnmounted, ref, watch } from 'vue'

  import * as schema from './db/schema'
  import { users } from './db/schema'
  import migration1 from './drizzle/0000_cute_kulan_gath.sql?raw'

  const results = ref<any[]>([])

  onMounted(async () => {
    // db.value = drizzle('duckdb-wasm://?bundles=import-url', { schema })
    // db.value = drizzle({ connection: { bundles: getImportUrlBundles() } }, { schema })

    await db.value?.execute(migration1)
    results.value = await db.value?.execute('SELECT count(*)::INTEGER as v FROM generate_series(0, 100) t(v)')
    console.log(results.value) // Output [{ v: 101 }]

    await db.value.insert(users).values({ id: '00000000-0000-0000-0000-000000000000' })
    const foundUsers = await db.value.select().from(users)
    console.log(foundUsers) // Output [{ id: '00000000-0000-0000-0000-000000000000' }]
  })

  onUnmounted(async () => {
    if (db.value) {
      const client = await db.value.$client
      await client.close()
    }
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
// ./db/schema.ts
import { sql } from 'drizzle-orm'
import { pgTable, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable('users', () => ({
  id: uuid().primaryKey().unique().default(sql`gen_random_uuid()`),
}))
```

```shell
drizzle-kit generate
```

```typescript
// ./src/index.ts
import { read } from 'node:fs/promises'
import { drizzle } from '@proj-airi/drizzle-duckdb-wasm'
import { getBundles } from '@proj-airi/drizzle-duckdb-wasm/bundles/default-node'

import * as schema from './db/schema'
import { users } from './db/schema'

async function main() {
  const db = drizzle({ connection: { bundles: getBundles() } }, { schema })

  // Run migration scripts
  const migration1 = await read('./drizzle/0000_cute_kulan_gath.sql', 'utf-8')
  await db.execute(migration1)

  const res = await db.execute('SELECT count(*)::INTEGER as v FROM generate_series(0, 100) t(v)')
  console.log(res) // Output [{ v: 101 }]

  await db.insert(users).values({ id: '00000000-0000-0000-0000-000000000000' })
  const foundUsers = await db.select().from(users)
  console.log(foundUsers) // Output [{ id: '00000000-0000-0000-0000-000000000000' }]

  // Remember to close it when you are done
  const client = await db.$client
  await client.close()
}
```

## Footnotes

Check out [the package](https://github.com/moeru-ai/airi/tree/main/packages/duckdb-wasm/README.md) we made for easier call to `@duckdb/duckdb-wasm` as well!
