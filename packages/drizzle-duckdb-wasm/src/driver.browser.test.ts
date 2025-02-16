import { DuckDBAccessMode } from '@duckdb/duckdb-wasm'
import { DBStorageType } from '@proj-airi/duckdb-wasm'
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest'

import { drizzle } from '.'
import { getImportUrlBundles } from './bundles/import-url-browser'

describe('drizzle with duckdb wasm in browser', { timeout: 10000 }, async () => {
  beforeAll(async () => {
    const opfsRoot = await navigator.storage.getDirectory()
    for await (const name of opfsRoot.keys()) {
      if (name.startsWith('drizzle_test_')) {
        await opfsRoot.removeEntry(name)
      }
    }
  })

  afterAll(async () => {
    const opfsRoot = await navigator.storage.getDirectory()
    for await (const name of opfsRoot.keys()) {
      if (name.startsWith('drizzle_test_')) {
        await opfsRoot.removeEntry(name)
      }
    }
  })

  it('should have navigator.storage.getDirectory', async () => {
    const getDirectory = navigator.storage?.getDirectory
    expect(typeof getDirectory).toBe('function')
  })

  it('should connect to an in-memory DuckDB WASM database', async () => {
    const db = drizzle({ connection: { bundles: getImportUrlBundles() } })
    const res = await db.execute('SELECT count(*)::INTEGER as v FROM generate_series(0, 100) t(v)')
    expect(res).toBeDefined()
    expect(res).toEqual([{ v: 101 }])
  })

  // TODO: Enable this test when DuckDB no longer creates files in read-only mode
  it.skip('should fail to open a non-existent OPFS database', async () => {
    const db = drizzle({
      connection: {
        bundles: getImportUrlBundles(),
        storage: {
          type: DBStorageType.ORIGIN_PRIVATE_FS,
          path: 'drizzle_test_non_existent',
          accessMode: DuckDBAccessMode.READ_ONLY,
        },
      },
    })
    // No need to close as the DB will fail to open

    await expect(db.$client).rejects.toThrow(/file or directory could not be found/)

    const opfsRoot = await navigator.storage.getDirectory()
    const nonExistentFileHandle = opfsRoot.getFileHandle('drizzle_test_non_existent', { create: false })
    await expect(nonExistentFileHandle).rejects.toThrow(/file or directory could not be found/)
  })

  it('should create and open an OPFS database', async () => {
    const path = `drizzle_test_${crypto.randomUUID().replace(/-/g, '')}`

    const db = drizzle({
      connection: {
        bundles: getImportUrlBundles(),
        storage: {
          type: DBStorageType.ORIGIN_PRIVATE_FS,
          path: `${path}`,
          accessMode: DuckDBAccessMode.READ_WRITE,
        },
      },
    })
    onTestFinished(async () => (await db.$client).close())

    await expect(db.$client).resolves.toBeDefined()
  })

  it('should not create an OPFS database with an empty path', async () => {
    const db = drizzle({
      connection: {
        bundles: getImportUrlBundles(),
        storage: {
          type: DBStorageType.ORIGIN_PRIVATE_FS,
          path: '',
          accessMode: DuckDBAccessMode.READ_WRITE,
        },
      },
    })
    // No need to close as the DB will fail to open

    await expect(db.$client).rejects.toThrow(/Name is not allowed/)
  })

  it('should not create an OPFS database with an invalid path', async () => {
    const path = `//drizzle_test_${crypto.randomUUID().replace(/-/g, '')}`

    const db = drizzle({
      connection: {
        bundles: getImportUrlBundles(),
        storage: {
          type: DBStorageType.ORIGIN_PRIVATE_FS,
          path: `${path}`,
          accessMode: DuckDBAccessMode.READ_WRITE,
        },
      },
    })
    // No need to close as the DB will fail to open

    await expect(db.$client).rejects.toThrow(/Name is not allowed/)
  })

  it('should open, update, save, and reload an OPFS database', async () => {
    const path = `drizzle_test_${crypto.randomUUID().replace(/-/g, '')}`

    const db1 = drizzle({
      connection: {
        bundles: getImportUrlBundles(),
        storage: {
          type: DBStorageType.ORIGIN_PRIVATE_FS,
          path: `${path}`,
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
        bundles: getImportUrlBundles(),
        storage: {
          type: DBStorageType.ORIGIN_PRIVATE_FS,
          path: `${path}`,
          accessMode: DuckDBAccessMode.READ_ONLY,
        },
      },
    })
    onTestFinished(async () => (await db2.$client).close())

    expect(await db2.execute('SHOW TABLES')).toEqual([{ name: 'test' }])
    expect(await db2.execute('SELECT * FROM test')).toEqual([{ v: 1 }, { v: 2 }, { v: 3 }])
  })

  it('should create open the same OPFS database with or without a leading slash', async () => {
    const path = `drizzle_test_${crypto.randomUUID().replace(/-/g, '')}`

    const db1 = drizzle({
      connection: {
        bundles: getImportUrlBundles(),
        storage: {
          type: DBStorageType.ORIGIN_PRIVATE_FS,
          path: `${path}`,
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
        bundles: getImportUrlBundles(),
        storage: {
          type: DBStorageType.ORIGIN_PRIVATE_FS,
          path: `/${path}`,
          accessMode: DuckDBAccessMode.READ_ONLY,
        },
      },
    })
    onTestFinished(async () => (await db2.$client).close())

    expect(await db2.execute('SHOW TABLES')).toEqual([{ name: 'test' }])
    expect(await db2.execute('SELECT * FROM test')).toEqual([{ v: 1 }, { v: 2 }, { v: 3 }])
  })

  it('should create, open, update, save, and reload an OPFS database with DSN', async () => {
    const path = `drizzle_test_${crypto.randomUUID().replace(/-/g, '')}`
    const dsn = `duckdb-wasm:///${path}?bundles=import-url&storage=origin-private-fs&write=true`

    const db1 = drizzle(dsn)
    onTestFinished(async () => (await db1.$client).close())

    await expect(db1.$client).resolves.toBeDefined()
    expect(await db1.execute('SHOW TABLES')).toEqual([])

    await expect(db1.execute('CREATE TABLE test (v INTEGER)')).resolves.toBeDefined()
    await expect(db1.execute('INSERT INTO test VALUES (1), (2), (3)')).resolves.toBeDefined()

    expect(await db1.execute('SELECT * FROM test')).toEqual([{ v: 1 }, { v: 2 }, { v: 3 }])

    await expect(db1.execute('CHECKPOINT')).resolves.toBeDefined()

    await expect((await db1.$client).close()).resolves.toBeUndefined()

    const db2 = drizzle(dsn)
    onTestFinished(async () => (await db2.$client).close())

    expect(await db2.execute('SHOW TABLES')).toEqual([{ name: 'test' }])
    expect(await db2.execute('SELECT * FROM test')).toEqual([{ v: 1 }, { v: 2 }, { v: 3 }])
  })
})
