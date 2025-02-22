import type { AsyncDuckDBConnection, DuckDBBundle, DuckDBBundles, Logger } from '@duckdb/duckdb-wasm'
import type { DBStorage } from './storage'

import { AsyncDuckDB, ConsoleLogger, selectBundle, VoidLogger } from '@duckdb/duckdb-wasm'
import { defu } from 'defu'

import { getEnvironment } from './common'
import { mapStructRowData } from './format'
import { DBStorageType } from './storage'

export type ConnectOptions = ConnectRequiredOptions & ConnectOptionalOptions

export interface ConnectOptionalOptions {
  bundles?: DuckDBBundles | Promise<DuckDBBundles>
  logger?: boolean | Logger
  storage?: DBStorage
}

export interface ConnectRequiredOptions {

}

export interface DuckDBWasmClient {
  worker: Worker
  db: AsyncDuckDB
  conn: AsyncDuckDBConnection
  close: () => Promise<void>
  query: (string, params?: unknown[]) => Promise<Record<string, unknown>[]>
}

export async function connect(options: ConnectOptions): Promise<DuckDBWasmClient> {
  const opts = defu(options, { logger: false })

  let worker: Worker
  let bundle: DuckDBBundle

  const env = await getEnvironment()
  if (env === 'browser') {
    if (typeof opts.bundles === 'undefined') {
      const { getBundles } = await import('./bundles/default-browser')
      opts.bundles = await getBundles()
    }

    bundle = await selectBundle(await opts.bundles)
    worker = new Worker(bundle.mainWorker!)
  }
  else if (env === 'node') {
    if (typeof opts.bundles === 'undefined') {
      const { getBundles } = await import('./bundles/default-node')
      opts.bundles = await getBundles()
    }

    bundle = await selectBundle(await opts.bundles)

    let workerUrl = bundle.mainWorker!
    if (workerUrl.startsWith('/@fs/')) {
      workerUrl = workerUrl.replace('/@fs/', 'file://')
    }

    const ww = await import('web-worker')
    // eslint-disable-next-line new-cap
    worker = new ww.default(workerUrl, { type: 'module' })
  }
  else {
    throw new Error(`Unsupported environment: ${env}`)
  }

  let logger: Logger
  if (opts.logger === true) {
    logger = new ConsoleLogger()
  }
  else if (opts.logger === false) {
    logger = new VoidLogger()
  }
  else {
    logger = opts.logger
  }

  const db = new AsyncDuckDB(logger, worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)

  if (opts.storage) {
    switch (opts.storage.type) {
      case DBStorageType.ORIGIN_PRIVATE_FS: {
        try {
          let strippedPath = opts.storage.path
          if (strippedPath.startsWith('/')) {
            // We will strip the only leading slash as it is not needed
            strippedPath = strippedPath.slice(1)
          }
          await db.open({
            path: `opfs://${strippedPath}`,
            accessMode: opts.storage.accessMode,
            // OPFS already uses direct IO
          })
        }
        catch (e) {
          await db.terminate()
          await worker.terminate()
          throw e
        }
        break
      }
      case DBStorageType.NODE_FS: {
        try {
          await db.open({
            path: opts.storage.path,
            accessMode: opts.storage.accessMode,
            useDirectIO: true, // Important! Otherwise the file will be created without DB init
          })
        }
        catch (e) {
          await db.terminate()
          await worker.terminate()
          throw e
        }
        break
      }
    }
  }

  const conn = await db.connect()

  return {
    worker,
    db,
    conn,
    query: async (query: string, params: unknown[] = []) => {
      if (!params || params.length === 0) {
        const results = await conn.query(query)
        return mapStructRowData(results)
      }

      const stmt = await conn.prepare(query)
      const results = await stmt.query(...params)
      const rows = mapStructRowData(results)

      stmt.close()
      return rows
    },
    close: async () => {
      await conn.close()
      await db.terminate()
      await worker.terminate()
    },
  }
}

export async function beginTransaction(client: Promise<DuckDBWasmClient>, txFn: (client: Promise<DuckDBWasmClient>) => Promise<any>): Promise<any> {
  await (await client).conn.send('BEGIN TRANSACTION')
  try {
    const result = await txFn(client)
    await (await client).conn.send('COMMIT')
    return result
  }
  catch (err) {
    await (await client).conn.send('ROLLBACK')
    throw err
  }
}

export async function withSavepoint(client: Promise<DuckDBWasmClient>, spName: string, txFn: (client: Promise<DuckDBWasmClient>) => Promise<any>): Promise<any> {
  await (await client).conn.send(`SAVEPOINT ${spName}`)
  try {
    const result = await txFn(client)
    await (await client).conn.send(`RELEASE SAVEPOINT ${spName}`)
    return result
  }
  catch (err) {
    await (await client).conn.send(`ROLLBACK TO SAVEPOINT ${spName}`)
    throw err
  }
}
