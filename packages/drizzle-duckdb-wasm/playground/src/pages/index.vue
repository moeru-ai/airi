<script setup lang="ts">
import type { DuckDBWasmDrizzleDatabase } from '../../../src'

import { DuckDBAccessMode } from '@duckdb/duckdb-wasm'
import { DBStorageType } from '@proj-airi/duckdb-wasm'
import { serialize } from 'superjson'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { drizzle } from '../../../src'
import { buildDSN } from '../../../src/dsn'
import * as schema from '../../db/schema'
import { users } from '../../db/schema'
import migration1 from '../../drizzle/0000_cute_kulan_gath.sql?raw'

const db = ref<DuckDBWasmDrizzleDatabase<typeof schema>>()
const results = ref<Record<string, unknown>[]>()
const schemaResults = ref<Record<string, unknown>[]>()
const isMigrated = ref(false)

const storage = ref<DBStorageType>()
const path = ref('test.db')
const logger = ref(true)
const readOnly = ref(false)

const dsn = computed(() => {
  return buildDSN({
    scheme: 'duckdb-wasm:',
    bundles: 'import-url',
    logger: logger.value,
    ...storage.value === DBStorageType.ORIGIN_PRIVATE_FS && {
      storage: {
        type: storage.value,
        path: path.value,
        accessMode: readOnly.value ? DuckDBAccessMode.READ_ONLY : DuckDBAccessMode.READ_WRITE,
      },
    },
  })
})

const query = ref(`SELECT * FROM 'users'`)

async function connect() {
  isMigrated.value = false
  db.value = drizzle(dsn.value, { schema })
  await db.value?.execute('INSTALL vss;')
  await db.value?.execute('LOAD vss;')
}

async function migrate() {
  await db.value?.execute(migration1)
  await db.value?.insert(users).values({
    id: '9449af72-faad-4c97-8a45-69f9f1ca1b05',
    decimal: '1.23456',
    numeric: '1.23456',
    real: 1.23456,
    double: 1.23456,
    interval: '365 day',
  })
  isMigrated.value = true
}

async function insert() {
  await db.value?.insert(users).values({
    id: crypto.randomUUID().replace(/-/g, ''),
    decimal: '1.23456',
    numeric: '1.23456',
    real: 1.23456,
    double: 1.23456,
    interval: '365 day',
  })
}

async function reconnect() {
  const client = await db.value?.$client
  await client?.close()
  await connect()
}

async function execute() {
  results.value = await db.value?.execute(query.value)
}

async function executeORM() {
  schemaResults.value = await db.value?.select().from(users)
}

async function shallowListOPFS() {
  const opfsRoot = await navigator.storage.getDirectory()
  const files: string[] = []
  for await (const name of opfsRoot.keys()) {
    files.push(name)
  }
  // eslint-disable-next-line no-console
  console.log(['Files in OPFS:', ...files].join('\n'))
}

async function wipeOPFS() {
  await db.value?.$client.then(client => client.close())
  const opfsRoot = await navigator.storage.getDirectory()
  const promises: Promise<void>[] = []
  for await (const name of opfsRoot.keys()) {
    promises.push(opfsRoot.removeEntry(name, { recursive: true }).then(() => {
      // eslint-disable-next-line no-console
      console.info(`File removed from OPFS: "${name}"`)
    }))
  }
  await Promise.all(promises)
}

onMounted(async () => {
  await connect()
  await migrate()

  results.value = await db.value?.execute(query.value)
  const usersResults = await db.value?.select().from(users)
  schemaResults.value = usersResults
})

onUnmounted(() => {
  db.value?.$client.then(client => client.close())
})
</script>

<template>
  <div flex flex-col gap-2>
    <h2 text-xl>
      Storage
    </h2>
    <div flex flex-row gap-2>
      <div flex flex-row gap-2>
        <input id="in-memory" v-model="storage" type="radio" :value="undefined">
        <label for="in-memory">In-Memory</label>
      </div>
      <div flex flex-row gap-2>
        <input id="opfs" v-model="storage" type="radio" :value="DBStorageType.ORIGIN_PRIVATE_FS">
        <label for="opfs">Origin Private FS</label>
      </div>
    </div>
  </div>
  <div grid grid-cols-3 gap-2>
    <div flex flex-col gap-2>
      <h2 text-xl>
        Logger
      </h2>
      <div flex flex-row gap-2>
        <input id="logger" v-model="logger" type="checkbox">
        <label for="logger">Enable</label>
      </div>
    </div>
    <div flex flex-col gap-2>
      <h2 text-xl>
        Read-only
      </h2>
      <div flex flex-row gap-2>
        <input id="readOnly" v-model="readOnly" type="checkbox">
        <label for="readOnly">Read-only (DB file creation will fail)</label>
      </div>
    </div>
  </div>
  <div v-if="storage === DBStorageType.ORIGIN_PRIVATE_FS" flex flex-col gap-2>
    <h2 text-xl>
      Path
    </h2>
    <div flex flex-col gap-1>
      <input v-model="path" type="text" w-full rounded-lg p-4 font-mono bg="neutral-100 dark:neutral-800">
      <div text-sm>
        <ul list-disc-inside>
          <li>
            Leading slash is optional ("/path/to/database.db" is equivalent to "path/to/database.db")
          </li>
          <li>Empty path is INVALID</li>
        </ul>
      </div>
    </div>
  </div>
  <div flex flex-col gap-2>
    <h2 text-xl>
      DSN (read-only)
    </h2>
    <div>
      <input v-model="dsn" readonly type="text" w-full rounded-lg p-4 font-mono bg="neutral-100 dark:neutral-800">
    </div>
  </div>
  <div flex flex-row justify-between gap-2>
    <div flex flex-row gap-2>
      <button rounded-lg bg="cyan-100 dark:cyan-900" px-4 py-2 @click="reconnect">
        Reconnect
      </button>
      <button
        rounded-lg bg="blue-100 dark:blue-900" px-4 py-2 :class="{ 'cursor-not-allowed': isMigrated }"
        :disabled="isMigrated" @click="migrate"
      >
        {{ isMigrated ? 'Already migrated 🥳' : 'Migrate' }}
      </button>
      <button rounded-lg bg="violet-100 dark:violet-900" px-4 py-2 @click="insert">
        Insert
      </button>
    </div>
    <div flex flex-row gap-2>
      <button rounded-lg bg="cyan-100 dark:cyan-900" px-4 py-2 @click="shallowListOPFS">
        List OPFS (See console)
      </button>
      <button rounded-lg bg="violet-100 dark:violet-900" px-4 py-2 @click="wipeOPFS">
        Wipe OPFS
      </button>
    </div>
  </div>
  <div grid grid-cols-2 gap-2>
    <div flex flex-col gap-2>
      <h2 text-xl>
        Executing
      </h2>
      <div>
        <textarea v-model="query" h-full w-full rounded-lg bg="neutral-100 dark:neutral-800" p-4 font-mono />
      </div>
      <div flex flex-row gap-2>
        <button rounded-lg bg="blue-100 dark:blue-900" px-4 py-2 @click="execute">
          Execute
        </button>
      </div>
      <div flex flex-col gap-2>
        <h2 text-xl>
          Results
        </h2>
        <div whitespace-pre-wrap p-4 font-mono>
          {{ JSON.stringify(serialize(results).json, null, 2) }}
        </div>
      </div>
    </div>
    <div>
      <div flex flex-col gap-2>
        <h2 text-xl>
          Executing (ORM, read-only)
        </h2>
        <div>
          <pre whitespace-pre-wrap rounded-lg p-4 font-mono bg="neutral-100 dark:neutral-800">
await db
  .insert(users)
  .values({
    id: crypto.randomUUID().replace(/-/g, ''),
    decimal: '1.23456',
    numeric: '1.23456',
    real: 1.23456,
    double: 1.23456,
    interval: '365 day',
  })

await db.select().from(users)
            </pre>
        </div>
        <div flex flex-row gap-2>
          <button rounded-lg bg="blue-100 dark:blue-900" px-4 py-2 @click="executeORM">
            Execute
          </button>
        </div>
      </div>
      <div flex flex-col gap-2>
        <h2 text-xl>
          Schema Results
        </h2>
        <div whitespace-pre-wrap p-4 font-mono>
          {{ JSON.stringify(serialize(schemaResults).json, null, 2) }}
        </div>
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
