<script setup lang="ts">
import type { DuckDBWasmDrizzleDatabase } from '../../src/drizzle-orm/browser'
import { onMounted, onUnmounted, ref } from 'vue'
import { drizzle } from '../../src/drizzle-orm/browser'
import * as schema from '../db/schema'
import { users } from '../db/schema'
import migration from '../migrations/0000_blue_selene.sql?raw'

const db = ref<DuckDBWasmDrizzleDatabase<typeof schema>>()
const results = ref<Record<string, unknown>[]>()
const query = ref(`SELECT 1 + 1 AS result`)

onMounted(async () => {
  db.value = drizzle('duckdb-wasm://?bundles=worker-url', { schema })
  await db.value?.execute(migration)

  await db.value.insert(users).values({ id: 1 })
  const res = await db.value.select().from(users)
  results.value = res
})

onUnmounted(() => {
  db.value?.$client.then(client => client.close())
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
