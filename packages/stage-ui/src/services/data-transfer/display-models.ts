import type { DataExportAdapter, DataImportAdapter, ManifestArchive } from '../../libs/data-transfer'
import type { DisplayModelFile } from '../../stores/display-models'

import * as v from 'valibot'

import { copyArrayBuffer, dataArchiveManifestPath, decodeManifestZipFile, encodeManifestZip, validateZipPaths } from '../../libs/data-transfer'
import { DisplayModelFormat, useDisplayModelsStore } from '../../stores/display-models'

const manifestPath = dataArchiveManifestPath
const modelPath = 'model.bin'
const displayModelFormat = 'airi-display-model'

const manifestSchema = v.strictObject({
  format: v.literal(displayModelFormat),
  version: v.literal(1),
  model: v.strictObject({
    format: v.picklist(Object.values(DisplayModelFormat)),
    name: v.pipe(v.string(), v.minLength(1)),
    fileName: v.pipe(v.string(), v.minLength(1)),
    path: v.literal(modelPath),
  }),
})

const modelFileSchema = v.pipe(v.instance(Uint8Array), v.check(file => file.byteLength > 0))

interface ValidatedDisplayModel {
  fileBytes: Uint8Array
  format: DisplayModelFormat
  name: string
  fileName: string
}

/** Creates an adapter for one imported model file. */
export function createDisplayModelExportAdapter(model: DisplayModelFile): DataExportAdapter<DisplayModelFile> {
  return {
    read: async () => model,
    encode: async (value, onProgress) => await encodeManifestZip({
      format: displayModelFormat,
      version: 1,
      model: { format: value.format, name: value.name, fileName: value.file.name, path: modelPath },
    }, { [modelPath]: value.file }, onProgress),
  }
}

/** Creates an adapter that validates a complete model archive before storing its file. */
export function createDisplayModelImportAdapter(): DataImportAdapter<ValidatedDisplayModel, ManifestArchive> {
  const store = useDisplayModelsStore()

  return {
    decode: async (file, onProgress) => await decodeManifestZipFile(file, onProgress),
    validate: async ({ archive, manifest }) => {
      const parsed = v.parse(manifestSchema, manifest)

      validateZipPaths(archive, [manifestPath, modelPath])

      const model = await archive.read(modelPath)

      return {
        fileBytes: v.parse(modelFileSchema, model),
        format: parsed.model.format,
        name: parsed.model.name,
        fileName: parsed.model.fileName,
      }
    },
    apply: async (value) => {
      const imported = await store.addDisplayModel(value.format, new File([copyArrayBuffer(value.fileBytes)], value.fileName))
      await store.renameDisplayModel(imported.id, value.name)
    },
  }
}
