import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { useVersionedLocalStorage } from '.'

class MemoryStorage {
  #items = new Map<string, string>()

  getItem(key: string) {
    return this.#items.get(key) ?? null
  }

  removeItem(key: string) {
    this.#items.delete(key)
  }

  setItem(key: string, value: string) {
    this.#items.set(key, value)
  }
}

const storage = new MemoryStorage()

afterEach(() => {
  storage.removeItem('settings/live2d/auto-blink-enabled')
})

describe('useVersionedLocalStorage', () => {
  /**
   * @example
   * expect(JSON.parse(localStorage.getItem('settings/live2d/auto-blink-enabled')!)).toEqual({ version: '2.0.0', data: false })
   */
  it('persists returned ref changes into the versioned localStorage wrapper', async () => {
    const value = useVersionedLocalStorage('settings/live2d/auto-blink-enabled', true, {
      defaultVersion: '2.0.0',
      storage,
    })

    // ROOT CAUSE:
    //
    // Versioned storage exposed an unwrapped `data` ref but only synchronized
    // storage -> data. UI changes updated the returned ref, while localStorage
    // stayed at the old `{ version, data }` wrapper value.
    //
    // We fixed this by syncing data -> storage without echoing storage reads
    // back into writes.
    value.value = false
    await nextTick()

    expect(JSON.parse(storage.getItem('settings/live2d/auto-blink-enabled')!)).toEqual({
      version: '2.0.0',
      data: false,
    })
  })
})
