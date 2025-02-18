import type { DuckDBBundles } from '@duckdb/duckdb-wasm'

export function getBundles(): DuckDBBundles {
  return {
    mvp: {
      mainModule: './duckdb-mvp.wasm',
      mainWorker: './duckdb-browser-mvp.worker.js',
    },
    eh: {
      mainModule: './duckdb-eh.wasm',
      mainWorker: './duckdb-browser-eh.worker.js',
    },
    coi: {
      mainModule: './duckdb-coi.wasm',
      mainWorker: './duckdb-browser-coi.worker.js',
      pthreadWorker: './duckdb-browser-coi.pthread.worker.js',
    },
  }
}
