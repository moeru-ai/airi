import type { DuckDBWasmClient } from '@proj-airi/duckdb-wasm'
import type { Assume, Logger, Query, RelationalSchemaConfig, TablesRelationalConfig } from 'drizzle-orm'
import type { PgDialect, PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig, SelectedFieldsOrdered } from 'drizzle-orm/pg-core'

import { beginTransaction, withSavepoint } from '@proj-airi/duckdb-wasm'
import { entityKind, fillPlaceholders, NoopLogger } from 'drizzle-orm'
import { PgPreparedQuery, PgSession, PgTransaction } from 'drizzle-orm/pg-core'

export type Row = Record<string, any>

export type RowList<T extends Row[]> = T

export class DuckDBWASMPreparedQuery<T extends PreparedQueryConfig> extends PgPreparedQuery<T> {
  static override readonly [entityKind]: string = 'DuckDBWasmPreparedQuery'

  constructor(
    private client: Promise<DuckDBWasmClient>,
    private queryString: string,
    private params: unknown[],
    private logger: Logger,
    private fields: SelectedFieldsOrdered | undefined,
    private customResultMapper?: (rows: unknown[][]) => T['execute'],
  ) {
    super({ sql: queryString, params })
  }

  async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
    const params = fillPlaceholders(this.params, placeholderValues)
    this.logger.logQuery(this.queryString, params)

    const { fields, queryString: query, client, customResultMapper } = this
    const c = await client

    if (!fields && !customResultMapper) {
      return c.query(query, params)
    }

    return c.query(query, params)
  }

  async all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
    const params = fillPlaceholders(this.params, placeholderValues)
    this.logger.logQuery(this.queryString, params)

    const c = await this.client
    return c.query(this.queryString, params)
  }
}

export interface DuckDBWASMSessionOptions {
  logger?: Logger
}

export class DuckDBWasmSession<
  TSQL extends Promise<DuckDBWasmClient>,
  TFullSchema extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> extends PgSession<DuckDBWasmQueryResultHKT, TFullSchema, TSchema> {
  static override readonly [entityKind]: string = 'DuckDBWasmSession'

  logger: Logger

  constructor(
    public client: TSQL,
    dialect: PgDialect,
    private schema: RelationalSchemaConfig<TSchema> | undefined,
    readonly options: DuckDBWASMSessionOptions = {},
  ) {
    super(dialect)
    this.logger = options.logger ?? new NoopLogger()
  }

  prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
    query: Query,
    fields: SelectedFieldsOrdered | undefined,
    name: string | undefined,
    isResponseInArrayMode: boolean,
    customResultMapper?: (rows: unknown[][]) => T['execute'],
  ): PgPreparedQuery<T> {
    return new DuckDBWASMPreparedQuery(
      this.client,
      query.sql,
      query.params,
      this.logger,
      fields,
      customResultMapper,
    )
  }

  async query(query: string, params: unknown[]): Promise<RowList<Row[]>> {
    this.logger.logQuery(query, params)
    const c = await this.client
    return c.query(query, params)
  }

  async queryObjects<T extends Row>(
    query: string,
    params: unknown[],
  ): Promise<RowList<T[]>> {
    this.logger.logQuery(query, params)
    const c = await this.client
    return c.query(query, params) as Promise<RowList<T[]>>
  }

  override transaction<T>(
    transaction: (tx: DuckDBWasmTransaction<TFullSchema, TSchema>) => Promise<T>,
    config?: PgTransactionConfig,
  ): Promise<T> {
    return beginTransaction(this.client, async (client) => {
      const session = new DuckDBWasmSession<Promise<DuckDBWasmClient>, TFullSchema, TSchema>(
        client,
        this.dialect,
        this.schema,
        this.options,
      )
      const tx = new DuckDBWasmTransaction(this.dialect, session, this.schema)
      if (config) {
        await tx.setTransaction(config)
      }

      return transaction(tx)
    }) as Promise<T>
  }
}

export class DuckDBWasmTransaction<
  TFullSchema extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> extends PgTransaction<DuckDBWasmQueryResultHKT, TFullSchema, TSchema> {
  static override readonly [entityKind]: string = 'DuckDBWasmTransaction'
  dialect: PgDialect
  session: DuckDBWasmSession<Promise<DuckDBWasmClient>, TFullSchema, TSchema>

  constructor(
    dialect: PgDialect,
    session: DuckDBWasmSession<Promise<DuckDBWasmClient>, TFullSchema, TSchema>,
    schema: RelationalSchemaConfig<TSchema> | undefined,
    nestedIndex = 0,
  ) {
    super(dialect, session, schema, nestedIndex)
    this.dialect = dialect
    this.session = session
  }

  override async transaction<T>(
    transaction: (tx: DuckDBWasmTransaction<TFullSchema, TSchema>) => Promise<T>,
  ): Promise<T> {
    return withSavepoint(this.session.client, '', async (client) => {
      const session = new DuckDBWasmSession<Promise<DuckDBWasmClient>, TFullSchema, TSchema>(
        client,
        this.dialect,
        this.schema,
        this.session.options,
      )

      const tx = new DuckDBWasmTransaction<TFullSchema, TSchema>(this.dialect, session, this.schema)
      return transaction(tx)
    }) as Promise<T>
  }
}

export interface DuckDBWasmQueryResultHKT extends PgQueryResultHKT {
  type: RowList<Assume<this['row'], Row>[]>
}
