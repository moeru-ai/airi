import type { DuckDBBundles, Logger } from '@duckdb/duckdb-wasm'
import type { DuckDBWasmClient } from '@proj-airi/duckdb-wasm'
import type { DrizzleConfig, RelationalSchemaConfig, TablesRelationalConfig } from 'drizzle-orm'
import type { DuckDBWasmQueryResultHKT } from './session'

import { ConsoleLogger } from '@duckdb/duckdb-wasm'
import { connect, getEnvironment } from '@proj-airi/duckdb-wasm'
import { createTableRelationsHelpers, DefaultLogger, entityKind, extractTablesRelationalConfig, isConfig } from 'drizzle-orm'
import { PgDatabase, PgDialect } from 'drizzle-orm/pg-core'

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

export function drizzle<
  TSchema extends Record<string, unknown> = Record<string, never>,
  TClient extends Promise<DuckDBWasmClient> = Promise<DuckDBWasmClient>,
>(
  ...params:
    | [{ connection: string | ({ url?: string, bundles?: DuckDBBundles | Promise<DuckDBBundles>, logger?: Logger | false }) }]
    | [{ connection: string | ({ url?: string, bundles?: DuckDBBundles | Promise<DuckDBBundles>, logger?: Logger | false }) }, DrizzleConfig<TSchema>]
    | [{ client: TClient }]
    | [{ client: TClient }, DrizzleConfig<TSchema>]
    | [ TClient | string ]
    | [ TClient | string, DrizzleConfig<TSchema> ]
): DuckDBWasmDrizzleDatabase<TSchema, TClient> {
  if (typeof params[0] === 'string') {
    const parsedDSN = new URL(params[0] as string)
    if (parsedDSN.searchParams.get('bundles') === 'import-url') {
      const logger = parsedDSN.searchParams.get('logger') === 'true' ? new ConsoleLogger() : undefined
      return construct(new Promise<DuckDBWasmClient>((resolve) => {
        getEnvironment().then((env) => {
          if (env === 'browser') {
            import('@proj-airi/duckdb-wasm/bundles/import-url-browser')
              .then(res => res.getImportUrlBundles())
              .then(bundles => connect({ bundles, logger }))
              .then(resolve)
          }
          else if (env === 'node') {
            import('@proj-airi/duckdb-wasm/bundles/import-url-node')
              .then(res => res.getImportUrlBundles())
              .then(bundles => connect({ bundles, logger }))
              .then(resolve)
          }
          else {
            throw new Error('Unsupported environment')
          }
        })
      }), params[1]) as any
    }

    const instance = connect({})
    return construct(instance, params[1]) as any
  }

  if (isConfig(params[0])) {
    const {
      connection,
      client,
      ...drizzleConfig
    } = params[0] as {
      connection?: {
        url?: string
        bundles?: DuckDBBundles
      }
      client?: TClient
    } & DrizzleConfig<TSchema>

    if (client)
      return construct(client, drizzleConfig) as any

    if (typeof connection === 'object') {
      if (connection.url !== undefined) {
        const { url } = connection
        const parsedDSN = new URL(url)
        const logger = parsedDSN.searchParams.get('logger') === 'true' ? new ConsoleLogger() : undefined
        if (parsedDSN.searchParams.get('bundles') === 'import-url') {
          return construct(new Promise<DuckDBWasmClient>((resolve) => {
            getEnvironment().then((env) => {
              if (env === 'browser') {
                import('@proj-airi/duckdb-wasm/bundles/import-url-browser')
                  .then(res => res.getImportUrlBundles())
                  .then(bundles => connect({ bundles, logger }))
                  .then(resolve)
              }
              else if (env === 'node') {
                import('@proj-airi/duckdb-wasm/bundles/import-url-node')
                  .then(res => res.getImportUrlBundles())
                  .then(bundles => connect({ bundles, logger }))
                  .then(resolve)
              }
              else {
                throw new Error('Unsupported environment')
              }
            })
          }), drizzleConfig) as any
        }
      }

      return construct(connect({ bundles: connection.bundles }), drizzleConfig) as any
    }

    return construct(connect({}), drizzleConfig) as any
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
