import type { DuckDBAccessMode } from '@duckdb/duckdb-wasm'

export enum DBStorageType {
  ORIGIN_PRIVATE_FS = 'origin-private-fs',
  NODE_FS = 'node-fs',
}

interface PathBasedFS {
  path: string

  /**
   * DuckDB will use {@link DuckDBAccessMode.READ_ONLY} if omitted.
   */
  accessMode?: DuckDBAccessMode
}

/**
 * Origin Private FS storage.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
 */
export interface DBOriginPrivateFS extends PathBasedFS {
  type: DBStorageType.ORIGIN_PRIVATE_FS

  /**
   * Path of the file in the Origin Private FS.
   *
   * Leading slash is not necessary and will be omitted if provided.
   */
  path: PathBasedFS['path']
}

export interface DBNodeFS extends PathBasedFS {
  type: DBStorageType.NODE_FS
}

export type DBStorage = DBOriginPrivateFS | DBNodeFS
