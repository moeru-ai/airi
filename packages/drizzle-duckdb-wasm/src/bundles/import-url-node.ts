/* eslint-disable perfectionist/sort-imports */
import type { DuckDBBundles } from '@duckdb/duckdb-wasm'

import ehMainWorker from '@duckdb/duckdb-wasm/dist/duckdb-node-eh.worker.cjs?url'
import ehMainModule from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import mvpMainWorker from '@duckdb/duckdb-wasm/dist/duckdb-node-mvp.worker.cjs?url'
import mvpMainModule from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'

function transformUrl(url: string) {
  if (url.startsWith('/@fs/')) {
    return url.replace('/@fs/', 'file://')
  }

  return url
}

export async function getImportUrlBundles(): Promise<DuckDBBundles> {
  return {
    mvp: {
      mainModule: transformUrl(mvpMainModule),
      mainWorker: transformUrl(mvpMainWorker),
    },
    eh: {
      mainModule: transformUrl(ehMainModule),
      mainWorker: transformUrl(ehMainWorker),
    },
  }
}
