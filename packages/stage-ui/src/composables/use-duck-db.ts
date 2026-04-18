import type { DuckDBWasmDrizzleDatabase } from '@proj-airi/drizzle-duckdb-wasm'

import { drizzle } from '@proj-airi/drizzle-duckdb-wasm'
import { getImportUrlBundles } from '@proj-airi/drizzle-duckdb-wasm/bundles/import-url-browser'
import { shallowRef } from 'vue'

const db = shallowRef<DuckDBWasmDrizzleDatabase | null>(null)
let isClosed = false
let launch: Promise<typeof db> | null = null

export function useDuckDb() {
  const closeDb = async () => {
    isClosed = true
    if (!db.value)
      return
    try {
      await (await db.value.$client).close()
    }
    catch (e) {
      console.error(`Error closing DuckDB: ${e}. Reference to the worker will be dropped regardless, but the cleanup may be incomplete.`)
    }
    finally {
      db.value = null
    }
  }

  const getDb = async () => {
    if (db.value && !isClosed) {
      return db
    }
    if (launch) {
      return launch
    }
    launch = (async () => {
      try {
        const dbInstance = drizzle({ connection: { bundles: getImportUrlBundles() } })
        await dbInstance.execute(`CREATE TABLE IF NOT EXISTS memory_test (vec FLOAT[768]);`)
        isClosed = false
        db.value = dbInstance
        return db
      }
      catch (error) {
        console.error(`Failed to init DuckDB ${error}, attempting to close it.`)
        closeDb()
        throw error
      }
      finally {
        launch = null
      }
    })()
    return launch
  }

  return {
    db,
    getDb,
    closeDb,
  }
}
