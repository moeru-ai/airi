import type { DBNodeFS } from '@proj-airi/duckdb-wasm'

import { randomUUID } from 'node:crypto'
import { readdir, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DuckDBAccessMode } from '@duckdb/duckdb-wasm'
import { DBStorageType } from '@proj-airi/duckdb-wasm'
import { getBundles } from '@proj-airi/duckdb-wasm/bundles/default-node'
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest'

import { drizzle } from '.'

describe('drizzle with duckdb wasm in node', { timeout: 10000 }, async () => {
  beforeAll(async () => {
    const tmp = tmpdir()
    await Promise.all(
      (await readdir(tmp)).reduce<Promise<void>[]>((tasks, filename) => {
        if (filename.startsWith('drizzle_test_')) {
          tasks.push(unlink(path.join(tmp, filename)))
        }
        return tasks
      }, []),
    )
  })

  afterAll(async () => {
    const tmp = tmpdir()
    await Promise.all(
      (await readdir(tmp)).reduce<Promise<void>[]>((tasks, filename) => {
        if (filename.startsWith('drizzle_test_')) {
          tasks.push(unlink(path.join(tmp, filename)))
        }
        return tasks
      }, []),
    )
  })

  it('should connect to an in-memory DuckDB WASM database', async () => {
    const db = drizzle({ connection: { bundles: getBundles() } })
    const res = await db.execute('SELECT count(*)::INTEGER as v FROM generate_series(0, 100) t(v)')
    expect(res).toBeDefined()
    expect(res).toEqual([{ v: 101 }])
  })

  it('should open a DuckDB WASM database in Node FS', async () => {
    const tmp = tmpdir()
    const filename = `drizzle_test_${randomUUID().replace(/-/g, '')}`

    const db = drizzle({
      connection: {
        bundles: getBundles(),
        storage: {
          type: DBStorageType.NODE_FS,
          path: path.resolve(tmp, filename),
          accessMode: DuckDBAccessMode.READ_WRITE,
        } as DBNodeFS,
      },
    })

    await expect(db.$client).resolves.toBeDefined()
  })

  it('should open, update, save, and reload an OPFS database', async () => {
    const tmp = tmpdir()
    const filename = `drizzle_test_${randomUUID().replace(/-/g, '')}`

    const db1 = drizzle({
      connection: {
        bundles: getBundles(),
        storage: {
          type: DBStorageType.NODE_FS,
          path: path.resolve(tmp, filename),
          accessMode: DuckDBAccessMode.READ_WRITE,
        },
      },
    })
    onTestFinished(async () => (await db1.$client).close())

    await expect(db1.$client).resolves.toBeDefined()
    expect(await db1.execute('SHOW TABLES')).toEqual([])

    await expect(db1.execute('CREATE TABLE test (v INTEGER)')).resolves.toBeDefined()
    await expect(db1.execute('INSERT INTO test VALUES (1), (2), (3)')).resolves.toBeDefined()

    expect(await db1.execute('SELECT * FROM test')).toEqual([{ v: 1 }, { v: 2 }, { v: 3 }])

    await expect(db1.execute('CHECKPOINT')).resolves.toBeDefined()

    await expect((await db1.$client).close()).resolves.toBeUndefined()

    const db2 = drizzle({
      connection: {
        bundles: getBundles(),
        storage: {
          type: DBStorageType.NODE_FS,
          path: path.resolve(tmp, filename),
          accessMode: DuckDBAccessMode.READ_ONLY,
        },
      },
    })
    onTestFinished(async () => (await db2.$client).close())

    expect(await db2.execute('SHOW TABLES')).toEqual([{ name: 'test' }])
    expect(await db2.execute('SELECT * FROM test')).toEqual([{ v: 1 }, { v: 2 }, { v: 3 }])
  })

  it('should create a table with a float array column', async () => {
    const db = drizzle({ connection: { bundles: getBundles() } })
    await db.execute('CREATE TABLE vector_test_table (v FLOAT[26880], v2 text)')
    await db.execute(`INSERT INTO vector_test_table VALUES (${JSON.stringify(Array.from({ length: 26880 }).fill(1))}, 'text')`)
    const res = await db.execute('SELECT * FROM vector_test_table')
    expect(res).toEqual([{ v: Array.from({ length: 26880 }).fill(1), v2: 'text' }])
  })
})
