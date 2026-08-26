import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayModelFormat, useDisplayModelsStore } from './display-models'

vi.mock('localforage', () => ({
  default: {
    getItem: vi.fn(async () => undefined),
    iterate: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
    setItem: vi.fn(async (_key: string, value: unknown) => value),
  },
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
      file: new File(['model'], 'model.zip'),
      format: DisplayModelFormat.Live2dZip,
      id: 'display-model-pending-idb-write',
      importedAt: 1,
      name: 'model.zip',
      type: 'file' as const,
    }

    store.displayModels = [model]

    const resolved = await store.getDisplayModel(model.id)

    expect(resolved).toEqual(model)
  })
})
