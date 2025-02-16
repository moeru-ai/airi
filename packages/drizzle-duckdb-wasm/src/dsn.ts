import type { DBStorage } from '@proj-airi/duckdb-wasm'

import { DuckDBAccessMode } from '@duckdb/duckdb-wasm'
import { DBStorageType } from '@proj-airi/duckdb-wasm'

export interface StructuredDSN {
  protocol: 'duckdb-wasm:'
  bundles?: 'import-url'
  logger?: boolean
  storage?: DBStorage
}

export function isLiterallyTrue(value?: string): boolean {
  return typeof value === 'string' && /^true$/i.test(value)
}

export function parseDSN(dsn: string): StructuredDSN {
  const structured: StructuredDSN = {
    protocol: 'duckdb-wasm:',
  }

  const parsed = new URL(dsn)

  if (!parsed.protocol.startsWith('duckdb-wasm:')) {
    throw new Error(`Expected protocol to be "duckdb-wasm:" but got "${parsed.protocol}"`)
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
