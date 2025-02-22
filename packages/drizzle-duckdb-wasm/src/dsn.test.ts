import type { DBOriginPrivateFS } from '@proj-airi/duckdb-wasm'
import type { StructuredDSN } from './dsn'

import { DuckDBAccessMode } from '@duckdb/duckdb-wasm'
import { DBStorageType } from '@proj-airi/duckdb-wasm'
import { describe, expect, it } from 'vitest'

import { buildDSN, parseDSN } from './dsn'
import { spyConsoleWarn } from './test-utils'

describe('parseDSN', { timeout: 10000 }, async () => {
  it('should fail with non-duckdb-wasm protocol', async () => {
    const dsn = 'random-db:///database.db'

    expect(() => parseDSN(dsn)).toThrow('Expected scheme to be "duckdb-wasm:" but got "random-db:"')
  })

  it('should parse OPFS with path', async () => {
    const dsn = 'duckdb-wasm:///path/to/database.db?storage=origin-private-fs'

    let structured: StructuredDSN
    expect(() => structured = parseDSN(dsn)).not.toThrow()
    expect(structured).toEqual({
      scheme: 'duckdb-wasm:',
      storage: {
        type: DBStorageType.ORIGIN_PRIVATE_FS,
        path: 'path/to/database.db',
      } as DBOriginPrivateFS,
    })
  })

  it('should parse OPFS with missing leading slash', async () => {
    const consoleWarnMock = spyConsoleWarn()

    const dsn = 'duckdb-wasm://path/to/database.db?storage=origin-private-fs'
    //                        ^~~~~ missing leading slash: this will be parsed as host/hostname

    let structured: StructuredDSN
    expect(() => structured = parseDSN(dsn)).not.toThrow()
    expect(structured).toEqual({
      scheme: 'duckdb-wasm:',
      storage: {
        type: DBStorageType.ORIGIN_PRIVATE_FS,
        path: 'to/database.db',
      } as DBOriginPrivateFS,
    })

    expect(consoleWarnMock).toHaveBeenCalledTimes(1)
    expect(consoleWarnMock).toHaveBeenCalledWith('Host "path" will be ignored while using Origin Private FS')
  })

  it('should parse OPFS with path and (write = true)', async () => {
    const dsn = 'duckdb-wasm:///path/to/database.db?storage=origin-private-fs&write=true'

    const structured = parseDSN(dsn)
    expect(structured).toEqual({
      scheme: 'duckdb-wasm:',
      storage: {
        type: DBStorageType.ORIGIN_PRIVATE_FS,
        path: 'path/to/database.db',
        accessMode: DuckDBAccessMode.READ_WRITE,
      } as DBOriginPrivateFS,
    })
  })

  it('should parse OPFS with path and (write = false)', async () => {
    const dsn = 'duckdb-wasm:///path/to/database.db?storage=origin-private-fs&write=false'

    const structured = parseDSN(dsn)
    expect(structured).toEqual({
      scheme: 'duckdb-wasm:',
      storage: {
        type: DBStorageType.ORIGIN_PRIVATE_FS,
        path: 'path/to/database.db',
      } as DBOriginPrivateFS,
    })
  })
})

describe('buildDSN', { timeout: 10000 }, async () => {
  it('should build DSN with OPFS (ro)', async () => {
    const structured: StructuredDSN = {
      scheme: 'duckdb-wasm:',
      bundles: 'import-url',
      storage: {
        type: DBStorageType.ORIGIN_PRIVATE_FS,
        path: 'path/to/database.db',
      } as DBOriginPrivateFS,
    }

    let url: URL
    expect(() => url = new URL(buildDSN(structured))).not.toThrow()
    expect(url.protocol).toBe('duckdb-wasm:')
    expect(url.host).toBe('')
    expect(url.pathname).toBe('/path/to/database.db')
    expect(url.searchParams.get('storage')).toBe(DBStorageType.ORIGIN_PRIVATE_FS)
    expect(url.searchParams.get('write')).toBeNull()
    expect(url.searchParams.get('bundles')).toBe('import-url')
  })

  it('should build DSN with OPFS (rw)', async () => {
    const structured: StructuredDSN = {
      scheme: 'duckdb-wasm:',
      bundles: 'import-url',
      storage: {
        type: DBStorageType.ORIGIN_PRIVATE_FS,
        path: 'path/to/database.db',
        accessMode: DuckDBAccessMode.READ_WRITE,
      } as DBOriginPrivateFS,
    }

    let url: URL
    expect(() => url = new URL(buildDSN(structured))).not.toThrow()
    expect(url.protocol).toBe('duckdb-wasm:')
    expect(url.host).toBe('')
    expect(url.pathname).toBe('/path/to/database.db')
    expect(url.searchParams.get('storage')).toBe(DBStorageType.ORIGIN_PRIVATE_FS)
    expect(url.searchParams.get('write')).toBe('true')
    expect(url.searchParams.get('bundles')).toBe('import-url')
  })

  it('should build the same DSN with OPFS but with a leading slash in the path', async () => {
    const structured: StructuredDSN = {
      scheme: 'duckdb-wasm:',
      bundles: 'import-url',
      storage: {
        type: DBStorageType.ORIGIN_PRIVATE_FS,
        path: '/path/to/database.db',
        accessMode: DuckDBAccessMode.READ_WRITE,
      } as DBOriginPrivateFS,
    }

    let url: URL
    expect(() => url = new URL(buildDSN(structured))).not.toThrow()
    expect(url.protocol).toBe('duckdb-wasm:')
    expect(url.host).toBe('')
    expect(url.pathname).toBe('/path/to/database.db')
    expect(url.searchParams.get('storage')).toBe(DBStorageType.ORIGIN_PRIVATE_FS)
    expect(url.searchParams.get('write')).toBe('true')
    expect(url.searchParams.get('bundles')).toBe('import-url')
  })
})
