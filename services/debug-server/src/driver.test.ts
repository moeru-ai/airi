import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { DuckDBInstance } from '@duckdb/node-api'
import { drizzle } from '@duckdbfan/drizzle-duckdb'
import { eq } from 'drizzle-orm'
import { expect, it } from 'vitest'

import { metadata } from './schema'

it('preserves PostgreSQL-style array literals stored in string columns', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'airi-debug-driver-'))
  const instance = await DuckDBInstance.create(join(directory, 'store.duckdb'))
  const connection = await instance.connect()
  const database = drizzle(connection, { schema: { metadata } })
  try {
    await connection.run('CREATE TABLE metadata (key VARCHAR PRIMARY KEY, value VARCHAR NOT NULL)')
    await database.insert(metadata).values({ key: 'empty-object', value: '{}' })
    await expect(database.select().from(metadata).where(eq(metadata.key, 'empty-object'))).resolves.toEqual([
      { key: 'empty-object', value: '{}' },
    ])
  }
  finally {
    await database.close()
    instance.closeSync()
    await rm(directory, { recursive: true, force: true })
  }
})
