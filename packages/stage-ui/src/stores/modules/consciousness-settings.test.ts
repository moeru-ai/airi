// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { useConsciousnessSettingsStore } from './consciousness-settings'

describe('consciousness settings store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('turns model thinking off by default', () => {
    const store = useConsciousnessSettingsStore()

    expect(store.thinking).toBe(false)
  })

  it('restores the default after the enabled value is persisted', async () => {
    const store = useConsciousnessSettingsStore()
    store.thinking = true
    await nextTick()

    expect(localStorage.getItem('settings/consciousness/thinking')).toBe('true')

    store.resetState()
    await nextTick()

    expect(store.thinking).toBe(false)
    expect(localStorage.getItem('settings/consciousness/thinking')).toBe('false')
  })

  it('ignores storage events because Pinia owns cross-window synchronization', () => {
    const store = useConsciousnessSettingsStore()

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'settings/consciousness/thinking',
      newValue: 'true',
    }))

    expect(store.thinking).toBe(false)
  })
})
