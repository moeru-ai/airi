import type { DuckDBWasmDrizzleDatabase } from '@proj-airi/drizzle-duckdb-wasm'

import { drizzle } from '@proj-airi/drizzle-duckdb-wasm'
import { getImportUrlBundles } from '@proj-airi/drizzle-duckdb-wasm/bundles/import-url-browser'
import { Mutex } from 'async-mutex'
import { shallowRef } from 'vue'

const db = shallowRef<DuckDBWasmDrizzleDatabase | null>(null)
const mutex = new Mutex()

export function useDuckDb() {
  const closeDb = () => mutex.runExclusive(async () => {
    if (!db.value)
      return // only close existing instance
    try {
      await (await db.value.$client).close()
    }
    catch (e) {
      console.error(`Error closing DuckDB: ${e}. Reference to the worker will be dropped regardless, but the cleanup may be incomplete.`)
    }
    db.value = null
  })

  const getDb = () =>
    mutex.runExclusive(async () => {
      if (db.value)
        return db
      let dbInstance
      try {
        dbInstance = drizzle({ connection: { bundles: getImportUrlBundles() } })
        await dbInstance.execute(`CREATE TABLE IF NOT EXISTS memory_test (vec FLOAT[768]);`)
        db.value = dbInstance
        return db
      }
      catch (error) {
        console.error(`Failed to init DuckDB ${error}, attempting to close it.`)
        await (await (dbInstance?.$client))?.close()
        throw error
      }
    })

  return {
    db,
    getDb,
    closeDb,
  }
}
