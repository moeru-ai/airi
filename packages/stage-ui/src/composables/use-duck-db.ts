import type { DuckDBWasmDrizzleDatabase } from '@proj-airi/drizzle-duckdb-wasm'

import { drizzle } from '@proj-airi/drizzle-duckdb-wasm'
import { getImportUrlBundles } from '@proj-airi/drizzle-duckdb-wasm/bundles/import-url-browser'
import { shallowRef } from 'vue'

let dbInstance: DuckDBWasmDrizzleDatabase | null = null
let isClosed = false
let launch: Promise<DuckDBWasmDrizzleDatabase> | null = null

export function useDuckDb() {
  // Reactive reference to the DB instance for the component
  const db = shallowRef<DuckDBWasmDrizzleDatabase | null>(null)

  // Helper to check if we already have a valid instance
  const hasInstance = () => dbInstance && !isClosed

  const getDb = async () => {
    if (hasInstance()) {
      return dbInstance
    }
    if (launch) {
      return launch
    }
    launch = (async () => {
      try {
        dbInstance = drizzle({ connection: { bundles: getImportUrlBundles() } })
        await dbInstance.execute(`CREATE TABLE IF NOT EXISTS memory_test (vec FLOAT[768]);`)
        isClosed = false

        // Update the reactive reference immediately
        db.value = dbInstance
        return dbInstance
      }
      catch (error) {
        console.error('Failed to init DuckDB', error)
        throw error
      }
      finally {
        launch = null
      }
    })()
    return launch
  }

  const closeDb = async () => {
    if (!dbInstance || isClosed)
      return
    isClosed = true
    try {
      await (await dbInstance.$client)?.close()
    }
    catch (e) {
      console.error('Error closing DuckDB', e)
    }
    finally {
      dbInstance = null
      db.value = null
    }
  }
  // Expose methods to component
  return {
    db,
    getDb,
    closeDb, // Only call this if you are shutting down the whole app
  }
}
