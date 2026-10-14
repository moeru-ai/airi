import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { downloadVerified } from '../libs/file-transfer/transfer'
import { requestDisplayModelDownload } from '../services/display-model-sync'
import { DisplayModelFormat, useDisplayModelsStore } from './display-models'

vi.mock('localforage', () => ({
  default: {
    getItem: vi.fn(async () => undefined),
    iterate: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
    setItem: vi.fn(async (_key: string, value: unknown) => value),
  },
}))

vi.mock('../services/display-model-sync', () => ({
  requestDisplayModelDownload: vi.fn(async () => ({ url: 'https://storage.test/model.zip', byteSize: 5, sha256: 'checksum' })),
}))

vi.mock('../libs/file-transfer/transfer', () => ({
  downloadVerified: vi.fn(async () => new Blob(['model'])),
}))

/**
 * @example
 * describe('display models store', () => {})
 */
describe('display models store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /**
   * @example
   * it('resolves newly imported display models from memory before IndexedDB', async () => {})
   */
  it('resolves newly imported display models from memory before IndexedDB', async () => {
    const store = useDisplayModelsStore()
    const model = {
      id: 'display-model-pending-idb-write',
      format: DisplayModelFormat.Live2dZip,
      type: 'file' as const,
      file: new File(['model'], 'model.zip'),
      name: 'model.zip',
      importedAt: 1,
    }

    store.displayModels = [model]

    const resolved = await store.getDisplayModel(model.id)

    expect(resolved).toEqual(model)
  })

  /**
   * @example
   * it('downloads a cloud model once when two callers pick it at the same time', async () => {})
   */
  it('downloads a cloud model once when two callers pick it at the same time', async () => {
    const store = useDisplayModelsStore()
    store.cloudModels = [{
      id: 'display-model-cloud',
      format: 'live2d-zip',
      name: 'Cloud model',
      originalFilename: 'cloud.zip',
      byteSize: 5,
      sha256: 'checksum',
      revision: 1,
      createdAt: '2026-10-14T00:00:00.000Z',
      updatedAt: '2026-10-14T00:00:00.000Z',
      deletedAt: null,
    }]

    const [first, second] = await Promise.all([
      store.ensureDisplayModelAvailable('display-model-cloud'),
      store.ensureDisplayModelAvailable('display-model-cloud'),
    ])

    expect(first).toBe(second)
    expect(requestDisplayModelDownload).toHaveBeenCalledTimes(1)
    expect(downloadVerified).toHaveBeenCalledTimes(1)
    expect(store.displayModels.filter(model => model.id === 'display-model-cloud')).toHaveLength(1)
  })
})
