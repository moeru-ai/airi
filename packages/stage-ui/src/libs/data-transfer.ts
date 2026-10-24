import JSZip from 'jszip'

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export interface DataTransferProgress {
  phase: 'decode' | 'validate' | 'apply' | 'encode'
  percentage: number
}

export type DataTransferProgressHandler = (progress: DataTransferProgress) => void

export interface DataExportAdapter<T> {
  /** Reads this data area's value before export. */
  read: () => Promise<T>

  /** Encodes the value as a file. Use onProgress when encoding reports progress. */
  encode: (value: T, onProgress?: (percentage: number) => void) => Promise<Blob>

  /** Returns true when the export needs confirmation before saving because it contains sensitive information. */
  containsSensitiveInformation?: (value: T) => boolean
}

export interface DataImportAdapter<T, Decoded = unknown> {
  /** Decodes the selected file before its data format is validated. */
  decode: (file: File, onProgress?: (percentage: number) => void) => Promise<Decoded>

  /** Validates the decoded value against this data area's schema before apply. */
  validate: (value: Decoded) => Promise<T>

  /** Applies the validated value to its existing data owner. */
  apply: (value: T) => Promise<void>
}

export interface DataExportResult {
  blob: Blob
  containsSensitiveInformation: boolean
}

export interface ZipArchive {
  paths: string[]
  read: (path: string, onProgress?: (percentage: number) => void) => Promise<Uint8Array>
}

export interface ManifestArchive {
  archive: ZipArchive
  manifest: unknown
}

export const dataArchiveManifestPath = 'manifest.json'

/** Creates a JSON export adapter and applies the shared versioned JSON envelope. */
export function createJsonDataExportAdapter<T>(
  format: string,
  read: () => Promise<T>,
  containsSensitiveInformation?: (value: T) => boolean,
): DataExportAdapter<T> {
  return {
    read,
    encode: async value => encodeJsonFile(format, value),
    ...(containsSensitiveInformation ? { containsSensitiveInformation } : {}),
  }
}

/** Runs the data owner's read and encoder in order, then reports file sensitivity. */
export async function exportData<T>(adapter: DataExportAdapter<T>, onProgress?: DataTransferProgressHandler): Promise<DataExportResult> {
  const value = await adapter.read()
  const blob = await adapter.encode(value, percentage => onProgress?.({ phase: 'encode', percentage }))
  const containsSensitiveInformation = adapter.containsSensitiveInformation?.(value) ?? false

  return { blob, containsSensitiveInformation }
}

/** Runs decode, validation, and apply in order. It never applies a value after decode or validation fails. */
export async function importData<T, Decoded = unknown>(
  adapter: DataImportAdapter<T, Decoded>,
  file: File,
  onProgress?: DataTransferProgressHandler,
): Promise<void> {
  onProgress?.({ phase: 'decode', percentage: 0 })
  const decoded = await adapter.decode(file, percentage => onProgress?.({ phase: 'decode', percentage }))
  onProgress?.({ phase: 'validate', percentage: 0 })
  const value = await adapter.validate(decoded)
  onProgress?.({ phase: 'apply', percentage: 0 })
  await adapter.apply(value)
  onProgress?.({ phase: 'apply', percentage: 100 })
}

/** Encodes a versioned JSON file for one data area. */
export function encodeJsonFile<T>(format: string, data: T): Blob {
  const content = JSON.stringify({ format, version: 1, data }, null, 2)
  return new Blob([content], { type: 'application/json' })
}

/** Parses JSON syntax. The importing adapter validates its data format. */
export async function decodeJsonFile(file: File): Promise<unknown> {
  return JSON.parse(await file.text()) as unknown
}

/** Adds files to a root-level ZIP and reports JSZip's generation progress. */
export async function encodeZipFile(
  files: Readonly<Record<string, Blob | string | Uint8Array>>,
  onProgress?: (percentage: number) => void,
): Promise<Blob> {
  const zip = new JSZip()
  for (const [path, value] of Object.entries(files)) {
    assertSafeZipPath(path)
    zip.file(path, value)
  }

  // The browser builds the whole ZIP Blob in memory. Browser memory errors do not share a standard error shape.
  return await zip.generateAsync({ type: 'blob' }, metadata => onProgress?.(metadata.percent))
}

/** Encodes a manifest and its files into a root-level ZIP archive. */
export function encodeManifestZip(
  manifest: JsonValue,
  files: Readonly<Record<string, Blob | string | Uint8Array>>,
  onProgress?: (percentage: number) => void,
): Promise<Blob> {
  return encodeZipFile({
    [dataArchiveManifestPath]: JSON.stringify(manifest),
    ...files,
  }, onProgress)
}

/** Reads ZIP entries without extracting paths to the file system. */
export async function decodeZipFile(file: File): Promise<ZipArchive> {
  const zip = await JSZip.loadAsync(file)
  const entries = Object.entries(zip.files)
  const paths = entries.map(([path, entry]) => {
    assertSafeZipPath(path)
    if (entry.dir || path.endsWith('/'))
      throw new Error('The ZIP file contains a directory entry')

    const permissions = entry.unixPermissions
    if (typeof permissions === 'number' && (permissions & 0o170000) === 0o120000)
      throw new Error('The ZIP file contains a symbolic link')

    return path
  })

  return {
    paths,
    read: async (path, onProgress) => {
      assertSafeZipPath(path)
      const entry = zip.file(path)
      if (!entry || entry.dir)
        throw new Error(`The ZIP file is missing ${path}`)
      return await entry.async('uint8array', metadata => onProgress?.(metadata.percent))
    },
  }
}

/** Reads the root manifest from a ZIP without extracting any path. */
export async function decodeManifestZipFile(file: File, onProgress?: (percentage: number) => void): Promise<ManifestArchive> {
  const archive = await decodeZipFile(file)
  const manifest = decodeJsonBytes(await archive.read(dataArchiveManifestPath, onProgress))
  return { archive, manifest }
}

/** Rejects ZIP entries that are missing from or undeclared by the manifest. */
export function validateZipPaths(archive: ZipArchive, expectedPaths: readonly string[]): void {
  const expected = [...expectedPaths].sort()
  const actual = [...archive.paths].sort()
  if (expected.length !== actual.length || expected.some((path, index) => path !== actual[index]))
    throw new Error('The ZIP entries do not match the manifest')
}

/** Decodes a UTF-8 JSON value from bytes. */
export function decodeJsonBytes(value: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(value)) as unknown
}

/** Copies bytes into an ArrayBuffer for browser and Electron APIs that reject shared backing buffers. */
export function copyArrayBuffer(value: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(value.byteLength)
  new Uint8Array(buffer).set(value)
  return buffer
}

function assertSafeZipPath(path: string): void {
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => part === '' || part === '.' || part === '..'))
    throw new Error(`The ZIP file contains an invalid path: ${path}`)
}
