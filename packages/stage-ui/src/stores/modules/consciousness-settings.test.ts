// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

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

  it('loads the persisted value', () => {
    localStorage.setItem('settings/consciousness/thinking', 'true')
    const store = useConsciousnessSettingsStore()

    expect(store.thinking).toBe(true)
  })

  it('persists changes through store actions', async () => {
    const store = useConsciousnessSettingsStore()
    await store.setThinking(true)

    expect(store.thinking).toBe(true)
    expect(localStorage.getItem('settings/consciousness/thinking')).toBe('true')

    await store.resetState()

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
