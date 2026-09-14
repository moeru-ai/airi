import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSettingsPersistenceStore } from './settings-persistence'

describe('settings save barriers', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
  })

  afterEach(() => {
    disposePinia(pinia)
  })

  it('waits for every registered writer', async () => {
    const store = useSettingsPersistenceStore(pinia)
    const first = Promise.withResolvers<void>()
    const second = Promise.withResolvers<void>()
    const completed = vi.fn()
    store.register(() => first.promise)
    store.register(() => second.promise)

    const saving = store.flush().then(completed)
    first.resolve()
    await first.promise
    expect(completed).not.toHaveBeenCalled()

    second.resolve()
    await saving
    expect(completed).toHaveBeenCalledOnce()
  })

  it('reports a failed writer and retries it on the next flush', async () => {
    const store = useSettingsPersistenceStore(pinia)
    const write = vi.fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('Leader unavailable'))
      .mockResolvedValueOnce()
    store.register(write)

    await expect(store.flush()).rejects.toThrow('Leader unavailable')
    await expect(store.flush()).resolves.toBeUndefined()
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('stops flushing a writer after it unregisters', async () => {
    const store = useSettingsPersistenceStore(pinia)
    const write = vi.fn<() => Promise<void>>().mockResolvedValue()
    const unregister = store.register(write)
    unregister()

    await store.flush()
    expect(write).not.toHaveBeenCalled()
  })

  it('releases registered writers when the store is disposed', async () => {
    const store = useSettingsPersistenceStore(pinia)
    const write = vi.fn<() => Promise<void>>().mockResolvedValue()
    store.register(write)
    store.$dispose()

    await store.flush()
    expect(write).not.toHaveBeenCalled()
  })
})
