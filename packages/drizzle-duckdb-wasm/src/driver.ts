import type { DuckDBBundles } from '@duckdb/duckdb-wasm'
import type { ConnectOptions, DuckDBWasmClient } from '@proj-airi/duckdb-wasm'
import type { DrizzleConfig, RelationalSchemaConfig, TablesRelationalConfig } from 'drizzle-orm'
import type { DuckDBWasmQueryResultHKT } from './session'

import { ConsoleLogger } from '@duckdb/duckdb-wasm'
import { connect, getEnvironment } from '@proj-airi/duckdb-wasm'
import { createTableRelationsHelpers, DefaultLogger, entityKind, extractTablesRelationalConfig, isConfig } from 'drizzle-orm'
import { PgDatabase, PgDialect } from 'drizzle-orm/pg-core'

import { parseDSN } from './dsn'
import { DuckDBWasmSession } from './session'

export class DuckDBWasmDatabase<
  TSchema extends Record<string, unknown> = Record<string, never>,
> extends PgDatabase<DuckDBWasmQueryResultHKT, TSchema> {
  static override readonly [entityKind]: string = 'DuckDBWasmDatabase'
}

function construct<
  TSchema extends Record<string, unknown> = Record<string, never>,
  TClient extends Promise<DuckDBWasmClient> = Promise<DuckDBWasmClient>,
>(
  client: Promise<DuckDBWasmClient>,
  config: DrizzleConfig<TSchema> = {},
): DuckDBWasmDrizzleDatabase<TSchema, TClient> {
  const dialect = new PgDialect({ casing: config.casing })
  let logger
  if (config.logger === true) {
    logger = new DefaultLogger()
  }
  else if (config.logger !== false) {
    logger = config.logger
  }

  let schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined
  if (config.schema) {
    const tablesConfig = extractTablesRelationalConfig(
      config.schema,
      createTableRelationsHelpers,
    )
    schema = {
      fullSchema: config.schema,
      schema: tablesConfig.tables,
      tableNamesMap: tablesConfig.tableNamesMap,
    }
  }

  const session = new DuckDBWasmSession(client, dialect, schema, { logger })
  const db = new DuckDBWasmDatabase(dialect, session, schema as any) as DuckDBWasmDatabase<TSchema>;
  (<any>db).$client = client

  return db as any
}

export interface DuckDBWasmDrizzleDatabase<
  TSchema extends Record<string, unknown> = Record<string, never>,
  TClient extends Promise<DuckDBWasmClient> = Promise<DuckDBWasmClient>,
> extends DuckDBWasmDatabase<TSchema> {
  $client: TClient
}

async function getBundles(importUrl = false): Promise<DuckDBBundles> {
  const env = await getEnvironment()
  switch (env) {
    case 'browser':
      return importUrl
        ? (await import('@proj-airi/duckdb-wasm/bundles/import-url-browser')).getImportUrlBundles()
        : (await import('@proj-airi/duckdb-wasm/bundles/default-browser')).getBundles()
    case 'node':
      return importUrl
        ? await (await import('@proj-airi/duckdb-wasm/bundles/import-url-node')).getImportUrlBundles()
        : await (await import('@proj-airi/duckdb-wasm/bundles/default-node')).getBundles()
    default:
      throw new Error(`Unsupported environment: "${env}"`)
  }
}

function constructByDSN<
  TSchema extends Record<string, unknown> = Record<string, never>,
>(
  dsn: string,
  drizzleConfig?: DrizzleConfig<TSchema>,
): DuckDBWasmDrizzleDatabase<TSchema, Promise<DuckDBWasmClient>> {
  const structured = parseDSN(dsn)

  return construct(connect({
    bundles: getBundles(structured.bundles === 'import-url'),
    logger: structured.logger ? new ConsoleLogger() : undefined,
    storage: structured.storage,
  }), drizzleConfig) as any
}

export function drizzle<
  TSchema extends Record<string, unknown> = Record<string, never>,
  TClient extends Promise<DuckDBWasmClient> = Promise<DuckDBWasmClient>,
>(
  ...params:
    | [{ connection: string | ConnectOptions }]
    | [{ connection: string | ConnectOptions }, DrizzleConfig<TSchema>]
    | [{ client: TClient }]
    | [{ client: TClient }, DrizzleConfig<TSchema>]
    | [ TClient | string ]
    | [ TClient | string, DrizzleConfig<TSchema> ]
): DuckDBWasmDrizzleDatabase<TSchema, TClient> {
  if (typeof params[0] === 'string') {
    return constructByDSN(params[0] as string, params[1]) as any
  }

  if (isConfig(params[0])) {
    const {
      connection,
      client,
      ...drizzleConfig
    } = params[0] as {
      connection?: string | ConnectOptions // a DSN or a ConnectOptions object
      client?: TClient
    } & DrizzleConfig<TSchema>

    if (client)
      return construct(client, drizzleConfig) as any

    if (typeof connection === 'string')
      return constructByDSN(connection, drizzleConfig) as any

    if (typeof connection === 'undefined')
      throw new Error('connection option is required')

    return construct(connect({
      bundles: connection.bundles,
      logger: connection.logger,
      storage: connection.storage,
    }), drizzleConfig) as any
  }

  return construct(params[0] as TClient, params[1] as DrizzleConfig<TSchema> | undefined) as any
}

// eslint-disable-next-line ts/no-namespace
export namespace drizzle {
  export function mock<TSchema extends Record<string, unknown> = Record<string, never>>(
    config?: DrizzleConfig<TSchema>,
  ): DuckDBWasmDatabase<TSchema> & {
    $client: '$client is not available on drizzle.mock()'
  } {
    return construct({
      options: {
        parsers: {},
        serializers: {},
      },
    } as any, config) as any
  }
}
