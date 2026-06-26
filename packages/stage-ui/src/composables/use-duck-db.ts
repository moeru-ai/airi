import type { DuckDBWasmDrizzleDatabase } from '@proj-airi/drizzle-duckdb-wasm'

import { drizzle } from '@proj-airi/drizzle-duckdb-wasm'
import { getImportUrlBundles } from '@proj-airi/drizzle-duckdb-wasm/bundles/import-url-browser'
import { Mutex } from 'async-mutex'
import { shallowRef } from 'vue'

const db = shallowRef<DuckDBWasmDrizzleDatabase | null>(null)
const mutex = new Mutex()

export function useDuckDb() {
  const closeDb = () =>
    mutex.runExclusive(() => {
      if (!db.value) return // only close existing instance
      return Promise.resolve(db.value.$client)
        .then((client) => client.close())
        .catch((e) => {
          console.error(
            `Error closing DuckDB: ${e}. Reference to the worker will be dropped regardless, but the cleanup may be incomplete.`,
          )
        })
        .then(() => {
          db.value = null
        })
    })

  const getDb = () =>
    mutex.runExclusive(() => {
      if (db.value) return db
      const dbInstance = drizzle({ connection: { bundles: getImportUrlBundles() } })
      return dbInstance
        .execute('CREATE TABLE IF NOT EXISTS memory_test (vec FLOAT[768]);')
        .then(() => {
          db.value = dbInstance
          return db
        })
        .catch((error) => {
          console.error(`Failed to init DuckDB ${error}, attempting to close it.`)
          return Promise.resolve(dbInstance?.$client)
            .then((client) => client?.close())
            .then(() => {
              throw error
            })
        })
    })

  return {
    db,
    getDb,
    closeDb,
  }
}
