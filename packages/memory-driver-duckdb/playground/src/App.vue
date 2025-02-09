<script setup lang="ts">
import type { DuckDBWasmDrizzleDatabase } from '../../src/drizzle-orm'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { drizzle } from '../../src/drizzle-orm'
import * as schema from '../db/schema'
import { users } from '../db/schema'
import migration from '../drizzle/0000_legal_gauntlet.sql?raw'

const db = ref<DuckDBWasmDrizzleDatabase<typeof schema>>()
const results = ref<Record<string, unknown>[]>()
const schemaResults = ref<Record<string, unknown>[]>()
const query = ref(`SELECT 1 + 1 AS result`)

onMounted(async () => {
  db.value = drizzle('duckdb-wasm://?bundles=worker-url', { schema })
  await db.value?.execute(migration)
  results.value = await db.value?.execute(query.value)

  await db.value.insert(users).values({ id: '9449af72-faad-4c97-8a45-69f9f1ca1b05' })
  schemaResults.value = await db.value.select().from(users)
})

onUnmounted(() => {
  db.value?.$client.then(client => client.close())
})

watch(query, async () => {
  results.value = await db.value?.execute(query.value)
})
</script>

<template>
  <div flex flex-col gap-4 p-4>
    <h1 text-2xl>
      <code>@duckdb/duckdb-wasm</code> + <code>drizzle-orm</code> Playground
    </h1>
    <div flex flex-col gap-2>
      <h2 text-xl>
        Executing
      </h2>
      <div>
        <textarea v-model="query" h-full w-full rounded-lg bg="gray-100 dark:gray-800" p-4 font-mono />
      </div>
    </div>
    <div flex flex-col gap-2>
      <h2 text-xl>
        Results
      </h2>
      <div whitespace-pre-wrap p-4 font-mono>
        {{ JSON.stringify(results, null, 2) }}
      </div>
    </div>
    <div flex flex-col gap-2>
      <h2 text-xl>
        Executing
      </h2>
      <div>
        <pre whitespace-pre-wrap p-4 font-mono bg="gray-100 dark:gray-800">
await db.insert(users).values({ id: '9449af72-faad-4c97-8a45-69f9f1ca1b05' })
await db.select().from(users)
        </pre>
      </div>
    </div>
    <div flex flex-col gap-2>
      <h2 text-xl>
        Schema Results
      </h2>
      <div whitespace-pre-wrap p-4 font-mono>
        {{ JSON.stringify(schemaResults, null, 2) }}
      </div>
    </div>
  </div>
</template>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
  padding: 0;
  overscroll-behavior: none;
}

html {
  background: #fff;
  transition: all 0.3s ease-in-out;
}

html.dark {
  background: #121212;
  color-scheme: dark;
}
</style>
