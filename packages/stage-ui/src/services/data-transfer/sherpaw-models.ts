import type { DataExportAdapter, DataImportAdapter, ManifestArchive, ZipArchive } from '../../libs/data-transfer'
import type { SherpawModelAssetBundle } from '../../libs/providers/providers/sherpaw/model-assets'

import * as v from 'valibot'

import { dataArchiveManifestPath, decodeManifestZipFile, encodeManifestZip, validateZipPaths } from '../../libs/data-transfer'
import { exportSherpawModelAssets, restoreSherpawModelAssets, validateSherpawModelAssetBundle } from '../../libs/providers/providers/sherpaw/model-assets'

const manifestPath = dataArchiveManifestPath
const archiveFormat = 'airi-sherpaw-model-assets'

const manifestSchema = v.strictObject({
  format: v.literal(archiveFormat),
  version: v.literal(1),
  id: v.pipe(v.string(), v.minLength(1)),
  revision: v.pipe(v.string(), v.minLength(1)),
  files: v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.minLength(1)),
})

/** Creates an adapter for one installed Sherpaw model. */
export function createSherpawModelExportAdapter(id: string): DataExportAdapter<SherpawModelAssetBundle> {
  return {
    read: async () => await exportSherpawModelAssets(id),
    encode: async (value, onProgress) => await encodeManifestZip({
      format: archiveFormat,
      version: 1,
      id: value.id,
      revision: value.revision,
      files: Object.keys(value.files),
    }, value.files, onProgress),
  }
}

/** Creates an adapter that validates all declared model files before restore. */
export function createSherpawModelImportAdapter(): DataImportAdapter<SherpawModelAssetBundle, ManifestArchive> {
  return {
    decode: async (file, onProgress) => await decodeManifestZipFile(file, onProgress),
    validate: async ({ archive, manifest }) => {
      const parsed = v.parse(manifestSchema, manifest)

      validateZipPaths(archive, [...parsed.files, manifestPath])

      const files = await readDeclaredFiles(archive, parsed.files)
      return validateSherpawModelAssetBundle(parsed.id, parsed.revision, files)
    },
    apply: async value => await restoreSherpawModelAssets(value),
  }
}

async function readDeclaredFiles(archive: ZipArchive, paths: readonly string[]): Promise<Record<string, Uint8Array>> {
  const entries = await Promise.all(paths.map(async path => [path, await archive.read(path)] as const))
  return Object.fromEntries(entries)
}
