import { expect, it, vi } from 'vitest'

import { encodeManifestZip, importData } from '../../libs/data-transfer'
import { createSherpawModelImportAdapter } from './sherpaw-models'

const modelAssets = vi.hoisted(() => {
  interface Bundle {
    id: string
    revision: string
    files: Record<string, Uint8Array>
  }

  return {
    export: vi.fn<(id: string) => Promise<Bundle>>(),
    list: vi.fn<() => Promise<{ id: string, state: string }[]>>(),
    remove: vi.fn<(id: string) => Promise<void>>(),
    restore: vi.fn<(bundle: Bundle) => Promise<void>>(),
    validate: vi.fn<(id: string, revision: string, files: Record<string, Uint8Array>) => Bundle>(),
  }
})

vi.mock('../../libs/providers/providers/sherpaw/model-assets', () => ({
  exportSherpawModelAssets: modelAssets.export,
  listSherpawModelAssets: modelAssets.list,
  removeSherpawModelAssets: modelAssets.remove,
  restoreSherpawModelAssets: modelAssets.restore,
  validateSherpawModelAssetBundle: modelAssets.validate,
}))

const modelId = 'test-model'
const revision = 'r1'

function bundle(data: number): { id: string, revision: string, files: Record<string, Uint8Array> } {
  return {
    id: modelId,
    revision,
    files: {
      data: Uint8Array.of(data),
      metadata: new TextEncoder().encode('metadata'),
    },
  }
}

async function importFile(value: ReturnType<typeof bundle>): Promise<File> {
  const archive = await encodeManifestZip({
    format: 'airi-sherpaw-model-assets',
    version: 1,
    id: value.id,
    revision: value.revision,
    files: Object.keys(value.files),
  }, value.files)
  return new File([archive], 'model.zip', { type: 'application/zip' })
}

it('restores the prior model archive when applying a replacement fails', async () => {
  let installed = bundle(1)
  let failNextRestore = true
  modelAssets.list.mockResolvedValue([{ id: modelId, state: 'installed' }])
  modelAssets.export.mockImplementation(async () => installed)
  modelAssets.validate.mockImplementation((id, version, files) => ({ id, revision: version, files }))
  modelAssets.restore.mockImplementation(async (value) => {
    installed = value
    if (failNextRestore) {
      failNextRestore = false
      throw new Error('Replacement failed')
    }
  })

  const replacement = importData(createSherpawModelImportAdapter(), await importFile(bundle(2)))
  await expect(replacement).rejects.toThrow('Replacement failed')

  expect(installed.files.data).toEqual(Uint8Array.of(1))
  expect(modelAssets.restore).toHaveBeenCalledTimes(2)
  expect(modelAssets.restore.mock.calls[1]?.[0].files.data).toEqual(Uint8Array.of(1))
})

it('removes partial model files when there was no previous installation', async () => {
  let installed = bundle(2)
  modelAssets.list.mockResolvedValue([{ id: modelId, state: 'missing' }])
  modelAssets.restore.mockRejectedValueOnce(new Error('Initial install failed'))
  modelAssets.remove.mockImplementation(async () => {
    installed = bundle(0)
  })
  modelAssets.validate.mockImplementation((id, version, files) => ({ id, revision: version, files }))

  const installation = importData(createSherpawModelImportAdapter(), await importFile(bundle(2)))
  await expect(installation).rejects.toThrow('Initial install failed')

  expect(modelAssets.remove).toHaveBeenCalledWith(modelId)
  expect(installed.files.data).toEqual(Uint8Array.of(0))
})
