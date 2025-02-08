import type { AsyncDuckDBConnection, DuckDBBundles, Logger } from '@duckdb/duckdb-wasm'
import { AsyncDuckDB, ConsoleLogger, selectBundle, VoidLogger } from '@duckdb/duckdb-wasm'
import { defu } from 'defu'
import { getBundles } from './duckdb-default-bundles'

export type ConnectOptions = ConnectRequiredOptions & ConnectOptionalOptions

export interface ConnectOptionalOptions {
  bundles?: DuckDBBundles
  logger?: boolean | Logger
}

export interface ConnectRequiredOptions {

}

export interface DuckDBWasmClient {
  worker: Worker
  db: AsyncDuckDB
  conn: AsyncDuckDBConnection
  close: () => Promise<void>
}

export async function connect(options: ConnectOptions): Promise<DuckDBWasmClient> {
  const opts = defu(options, { bundles: getBundles(), logger: false })

  const bundle = await selectBundle(opts.bundles)
  const worker = new Worker(bundle.mainWorker!)

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
  const conn = await db.connect()

  return {
    worker,
    db,
    conn,
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
