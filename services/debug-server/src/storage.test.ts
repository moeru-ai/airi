import { Buffer } from 'node:buffer'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { DuckDBInstance } from '@duckdb/node-api'
import { expect, it } from 'vitest'

import { decodeOtlp } from './protocol'
import { CursorExpiredError, DebugStorage } from './storage'

it('rejects changed migration history and releases the database after failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'airi-debug-migration-'))
  const options = { path: join(directory, 'store.duckdb'), retentionDays: 7, maxStoredBytes: 10_000_000 }
  try {
    const storage = await DebugStorage.open(options)
    await storage.ingest(batch(1, 'before-restart'))
    await storage.close()
    const instance = await DuckDBInstance.create(options.path)
    const connection = await instance.connect()
    const migrations = (await connection.runAndReadAll('SELECT hash FROM __drizzle_migrations ORDER BY created_at')).getRowObjectsJS()
    expect(migrations).toHaveLength(2)
    await connection.run('UPDATE __drizzle_migrations SET hash = \'modified\' WHERE hash = ?', [String(migrations[0].hash)])
    connection.closeSync()
    instance.closeSync()
    await expect(DebugStorage.open(options)).rejects.toThrow('migration history differs')
    const reopened = await DuckDBInstance.create(options.path)
    const reader = await reopened.connect()
    try {
      expect((await reader.runAndReadAll('SELECT count(*) AS count FROM events')).getRowObjectsJS()).toEqual([{ count: 1n }])
    }
    finally {
      reader.closeSync()
      reopened.closeSync()
    }
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('rejects pre-migration stores without modifying their tables', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'airi-debug-legacy-'))
  const options = { path: join(directory, 'store.duckdb'), retentionDays: 7, maxStoredBytes: 10_000_000 }
  try {
    const instance = await DuckDBInstance.create(options.path)
    const connection = await instance.connect()
    await connection.run('CREATE TABLE events (raw_json VARCHAR); INSERT INTO events VALUES (\'preserve\')')
    connection.closeSync()
    instance.closeSync()
    await expect(DebugStorage.open(options)).rejects.toThrow('AIRI_DEBUG_DB_PATH')
    const reopened = await DuckDBInstance.create(options.path)
    const reader = await reopened.connect()
    try {
      expect((await reader.runAndReadAll('SELECT * FROM events')).getRowObjectsJS()).toEqual([{ raw_json: 'preserve' }])
      expect((await reader.runAndReadAll('SELECT table_name FROM information_schema.tables WHERE table_name = \'__drizzle_migrations\'')).getRowObjectsJS()).toEqual([])
    }
    finally {
      reader.closeSync()
      reopened.closeSync()
    }
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})

function batch(count: number, content = 'progress') {
  const receivedUnixNano = (BigInt(Date.now()) * 1_000_000n).toString()
  const body = Buffer.from(JSON.stringify({
    resourceLogs: [{
      resource: { attributes: [{ key: 'service.instance.id', value: { stringValue: 'storage-test' } }] },
      scopeLogs: [{
        logRecords: Array.from({ length: count }, (_, index) => ({
          timeUnixNano: receivedUnixNano,
          body: { stringValue: content },
          attributes: [{ key: 'event_id', value: { stringValue: `${content}-${index}` } }],
        })),
      }],
    }],
  }))
  const decoded = decodeOtlp('log', body, 'application/json', receivedUnixNano)
  return {
    body: decoded.persistedBody,
    records: decoded.records,
    receivedUnixNano,
    contentType: 'application/json',
    contentEncoding: '',
    signal: 'log' as const,
  }
}

it('does not expose partial transactions to readers and deduplicates stable log identities', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'airi-debug-storage-'))
  const storage = await DebugStorage.open({ path: join(directory, 'store.duckdb'), retentionDays: 7, maxStoredBytes: 10_000_000 })
  try {
    const input = batch(100)
    const writing = storage.ingest(input)
    for (let iteration = 0; iteration < 12; iteration++) {
      const page = await storage.listEvents({ afterCursor: '', pageSize: 200 })
      expect([0, 100]).toContain(page.events.length)
    }
    expect((await writing).inserted).toBe(100)
    expect((await storage.ingest(input)).inserted).toBe(0)
    expect((await storage.listEvents({ afterCursor: '', pageSize: 200 })).events).toHaveLength(100)
  }
  finally {
    await storage.close()
    await rm(directory, { recursive: true, force: true })
  }
})

it('rolls back failed writes without treating sequence gaps as expired history', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'airi-debug-rollback-'))
  const storage = await DebugStorage.open({ path: join(directory, 'store.duckdb'), retentionDays: 7, maxStoredBytes: 10_000_000 })
  try {
    const invalid = batch(2)
    invalid.records[1].timeUnixNano = 'not-an-integer'
    await expect(storage.ingest(invalid)).rejects.toThrow()
    expect((await storage.listEvents({ afterCursor: '', pageSize: 10 })).events).toHaveLength(0)
    expect((await storage.ingest(batch(1, 'after-failure'))).inserted).toBe(1)
    const recovered = await storage.listEvents({ afterCursor: '1', pageSize: 10 })
    expect(recovered.events).toHaveLength(1)
    expect(recovered.events[0].rawJson).toContain('after-failure')
  }
  finally {
    await storage.close()
    await rm(directory, { recursive: true, force: true })
  }
})

it('bounds retained batches and preserves the deletion watermark after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'airi-debug-retention-'))
  const options = { path: join(directory, 'store.duckdb'), retentionDays: 7, maxStoredBytes: 1500 }
  let storage = await DebugStorage.open(options)
  try {
    await storage.ingest(batch(1))
    const initial = await storage.listEvents({ afterCursor: '', pageSize: 10 })
    expect(initial.events).toHaveLength(1)
    const cursor = initial.events[0].cursor
    await storage.ingest(batch(1, 'x'.repeat(2000)))
    expect((await storage.listEvents({ afterCursor: '', pageSize: 10 })).events).toHaveLength(0)
    expect((await storage.listSources({ afterCursor: '', pageSize: 10 })).sources).toHaveLength(0)
    expect((await storage.exportRecords('', 10)).batches).toHaveLength(0)
    await storage.close()
    storage = await DebugStorage.open(options)
    await expect(storage.listEvents({ afterCursor: cursor, pageSize: 10 })).rejects.toBeInstanceOf(CursorExpiredError)
    await expect(storage.listEvents({ afterCursor: '2', pageSize: 10 })).resolves.toMatchObject({ events: [] })
  }
  finally {
    await storage.close()
    await rm(directory, { recursive: true, force: true })
  }
})
