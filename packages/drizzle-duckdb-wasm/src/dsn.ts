import type { DBStorage } from '@proj-airi/duckdb-wasm'

import { DuckDBAccessMode } from '@duckdb/duckdb-wasm'
import { DBStorageType } from '@proj-airi/duckdb-wasm'

export interface StructuredDSN {
  scheme: 'duckdb-wasm:'
  bundles?: 'import-url'
  logger?: boolean
  storage?: DBStorage
}

export function isLiterallyTrue(value?: string): boolean {
  return typeof value === 'string' && /^true$/i.test(value)
}

/**
 * Parse a DuckDB WASM DSN string into a structured object
 *
 * Examples:
 * - `duckdb-wasm:///` -> In-memory
 * - `duckdb-wasm:///?bundles=import-url` -> In-memory, use import-URL bundles
 * - `duckdb-wasm:///?logger=true` -> In-memory, enable logger
 * - `duckdb-wasm://database.db?storage=origin-private-fs&write=true` -> Origin Private FS, RW, database.db
 * - `duckdb-wasm:///database.db?storage=origin-private-fs&write=true` -> Origin Private FS, RW, database.db (leading slash is optional)
 *
 * @param dsn The DSN string to parse
 */
export function parseDSN(dsn: string): StructuredDSN {
  const structured: StructuredDSN = {
    scheme: 'duckdb-wasm:',
  }

  const parsed = new URL(dsn)

  // The protocol in the URL maps to the scheme in the DSN (URI)
  // See: https://developer.mozilla.org/en-US/docs/Web/API/URL/protocol
  if (!parsed.protocol.startsWith('duckdb-wasm:')) {
    throw new Error(`Expected scheme to be "duckdb-wasm:" but got "${parsed.protocol}"`)
  }

  if (parsed.searchParams.get('bundles') === 'import-url') {
    structured.bundles = 'import-url'
  }

  if (isLiterallyTrue(parsed.searchParams.get('logger'))) {
    structured.logger = true
  }

  const paramStorage = parsed.searchParams.get('storage')
  switch (paramStorage) {
    case DBStorageType.ORIGIN_PRIVATE_FS: {
      if (parsed.host.length > 0) {
        console.warn(`Host "${parsed.host}" will be ignored while using Origin Private FS`)
      }
      const paramWrite = parsed.searchParams.get('write')
      structured.storage = {
        type: DBStorageType.ORIGIN_PRIVATE_FS,
        path: parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname,
        ...isLiterallyTrue(paramWrite) && {
          accessMode: DuckDBAccessMode.READ_WRITE,
        },
      }
      break
    }
    case null:
      break
    default:
      console.warn(`Unknown storage type "${paramStorage}"`)
      break
  }

  return structured
}

/**
 * Build a DuckDB WASM DSN string from a structured DSN object
 *
 * @param structured The structured DSN object
 * @returns The DSN string
 */
export function buildDSN(structured: StructuredDSN): string {
  const parsed = new URL('duckdb-wasm:///')

  if (structured.bundles === 'import-url') {
    parsed.searchParams.set('bundles', 'import-url')
  }

  if (structured.logger) {
    parsed.searchParams.set('logger', 'true')
  }

  if (structured.storage) {
    parsed.searchParams.set('storage', structured.storage.type)

    switch (structured.storage.type) {
      case DBStorageType.ORIGIN_PRIVATE_FS:
        parsed.pathname = structured.storage.path
        if (!parsed.pathname.startsWith('/')) {
          // To make the pathname pathname in the URL
          parsed.pathname = `/${parsed.pathname}`
        }
        if (structured.storage.accessMode === DuckDBAccessMode.READ_WRITE) {
          parsed.searchParams.set('write', 'true')
        }
        break
      case DBStorageType.NODE_FS:
        parsed.pathname = structured.storage.path
        if (structured.storage.accessMode === DuckDBAccessMode.READ_WRITE) {
          parsed.searchParams.set('write', 'true')
        }
        break
    }
  }

  return parsed.toString()
}
