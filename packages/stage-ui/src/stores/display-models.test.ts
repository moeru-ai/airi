import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayModelFormat, useDisplayModelsStore } from './display-models'

vi.mock('localforage', () => ({
  default: {
    getItem: vi.fn(() => undefined),
    iterate: vi.fn(() => undefined),
    removeItem: vi.fn(() => undefined),
    setItem: vi.fn((_key: string, value: unknown) => Promise.resolve(value)),
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
})
