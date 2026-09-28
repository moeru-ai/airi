import type { ModelAsset } from '@proj-airi/stage-shared/model-assets'

import { afterEach, describe, expect, it } from 'vitest'

import { OpfsModelAssetStorage } from './model-assets-opfs'

const storage = new OpfsModelAssetStorage()
const ids: ModelAsset[] = []
const urls: string[] = []

function asset(metadataUrl: string): ModelAsset {
  const dataUrl = URL.createObjectURL(new Blob(['model data']))
  urls.push(dataUrl)
  const model: ModelAsset = {
    id: `test-${crypto.randomUUID()}`,
    revision: 'v1',
    source: 'remote',
    files: [
      { name: 'data', url: dataUrl },
      { name: 'metadata', url: metadataUrl },
    ],
  }
  ids.push(model)
  return model
}

afterEach(async () => {
  await Promise.all(ids.splice(0).map(model => storage.remove(model)))
  urls.splice(0).forEach(url => URL.revokeObjectURL(url))
})

describe('origin private model asset storage', () => {
  it('exposes a model only after every file is stored', async () => {
    const metadataUrl = URL.createObjectURL(new Blob(['metadata']))
    urls.push(metadataUrl)
    const model = asset(metadataUrl)
    const progress: string[] = []

    await storage.install(model, event => progress.push(event.file), new AbortController().signal)

    expect(await storage.has(model)).toBe(true)
    expect(progress).toContain('data')
    expect(progress).toContain('metadata')
    expect(await (await storage.open(model, model.files[0]!)).text()).toBe('model data')
  })

  it('removes a partially downloaded pair after a file fails', async () => {
    const model = asset('data:')

    await expect(storage.install(model, () => {}, new AbortController().signal)).rejects.toThrow()
    expect(await storage.has(model)).toBe(false)
  })
})
