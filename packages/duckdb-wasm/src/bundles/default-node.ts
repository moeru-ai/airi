import type { DuckDBBundles } from '@duckdb/duckdb-wasm'

export async function getBundles(): Promise<DuckDBBundles> {
  const { createRequire } = await import('node:module')
  const { dirname, resolve } = await import('node:path')
  const require = createRequire(import.meta.url)
  const DUCKDB_DIST = dirname(require.resolve('@duckdb/duckdb-wasm'))

  return {
    mvp: {
      mainModule: resolve(DUCKDB_DIST, './duckdb-mvp.wasm'),
      mainWorker: resolve(DUCKDB_DIST, './duckdb-node-mvp.worker.cjs'),
    },
    eh: {
      mainModule: resolve(DUCKDB_DIST, './duckdb-eh.wasm'),
      mainWorker: resolve(DUCKDB_DIST, './duckdb-node-eh.worker.cjs'),
    },
  }
}
