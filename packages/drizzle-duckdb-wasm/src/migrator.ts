import type { MigrationConfig } from 'drizzle-orm/migrator'
import type { PgSession } from 'drizzle-orm/pg-core'
import type { DuckDBWasmDatabase } from './driver'

import { readMigrationFiles } from 'drizzle-orm/migrator'

export async function migrate<TSchema extends Record<string, unknown>>(
  db: DuckDBWasmDatabase<TSchema>,
  config: MigrationConfig,
) {
  const migrations = readMigrationFiles(config)
  await (db as any).dialect.migrate(migrations, (db as any).session as unknown as PgSession, config)
}
