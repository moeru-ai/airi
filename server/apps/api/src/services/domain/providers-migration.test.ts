import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { array, boolean, number, object, parse, string } from 'valibot'
import { expect, it } from 'vitest'

// https://github.com/moeru-ai/airi/pull/2590#discussion_r4179494337
// ROOT CAUSE:
//
// The provider display-name migration was missing from the Drizzle journal.
// The production migrator applies only migrations listed in that journal.
//
// We fixed this by adding the migration after the journal tail. This test upgrades
// an existing database through the Drizzle migrator.
it('upgrades an existing database through the Drizzle migrator', async () => {
  const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url))
  const migrations = readMigrationFiles({ migrationsFolder })
  const journal = parse(object({
    entries: array(object({ idx: number(), tag: string(), breakpoints: boolean() })),
  }), JSON.parse(await readFile(new URL('../../../drizzle/meta/_journal.json', import.meta.url), 'utf8')))
  const previousJournalTailIndex = journal.entries.findIndex(entry => entry.tag === '0034_llm_request_log_created_index')
  if (previousJournalTailIndex === -1)
    throw new Error('The published 0034 migration is missing from the Drizzle journal')
  expect(journal.entries[previousJournalTailIndex + 1]).toMatchObject({ idx: 35, tag: '0035_add_provider_display_name' })
  const previousMigrations = migrations.slice(0, previousJournalTailIndex + 1)
  const client = new PGlite()
  const db = drizzle(client)

  try {
    for (const migration of previousMigrations) {
      for (const statement of migration.sql)
        await client.exec(statement)
    }

    await client.exec(`
      CREATE SCHEMA drizzle;
      CREATE TABLE drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `)
    for (const migration of previousMigrations) {
      await client.query(
        'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
        [migration.hash, migration.folderMillis],
      )
    }

    await client.exec(`
      INSERT INTO user_provider_configs (id, owner_id, instance_id, definition_id, config)
      VALUES ('provider-config', 'owner', 'instance', 'definition', '{}')
    `)

    await migrate(db, { migrationsFolder })
    await migrate(db, { migrationsFolder })

    expect((await client.query('SELECT tablename FROM pg_tables WHERE tablename = \'upload_sessions\'')).rows).toEqual([{ tablename: 'upload_sessions' }])
    expect((await client.query('SELECT indexname FROM pg_indexes WHERE indexname = \'llm_request_log_created_idx\'')).rows).toEqual([{ indexname: 'llm_request_log_created_idx' }])

    expect((await client.query('SELECT id, definition_id, display_name FROM user_provider_configs')).rows).toEqual([{
      id: 'provider-config',
      definition_id: 'definition',
      display_name: null,
    }])
  }
  finally {
    await client.close()
  }
})
