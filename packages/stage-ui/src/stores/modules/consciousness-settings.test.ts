// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useConsciousnessSettingsStore } from './consciousness-settings'

describe('consciousness settings store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('turns model reasoning off by default', () => {
    const store = useConsciousnessSettingsStore()

    expect(store.reasoning).toBe(false)
  })

  it('loads the persisted value', () => {
    localStorage.setItem('settings/consciousness/reasoning', 'true')
    const store = useConsciousnessSettingsStore()

    expect(store.reasoning).toBe(true)
  })

  it('persists changes through store actions', async () => {
    const store = useConsciousnessSettingsStore()
    await store.setReasoning(true)

    expect(store.reasoning).toBe(true)
    expect(localStorage.getItem('settings/consciousness/reasoning')).toBe('true')

    await store.resetState()

    expect(store.reasoning).toBe(false)
    expect(localStorage.getItem('settings/consciousness/reasoning')).toBe('false')
  })

  it('names new conversations by default and loads the persisted choice', () => {
    expect(useConsciousnessSettingsStore().titleGeneration).toBe(true)

    localStorage.setItem('settings/consciousness/title-generation', 'false')
    setActivePinia(createPinia())

    expect(useConsciousnessSettingsStore().titleGeneration).toBe(false)
  })

  it('turns conversation naming back on when the settings reset', async () => {
    const store = useConsciousnessSettingsStore()
    await store.setTitleGeneration(false)

    expect(localStorage.getItem('settings/consciousness/title-generation')).toBe('false')

    await store.resetState()

    expect(store.titleGeneration).toBe(true)
    expect(localStorage.getItem('settings/consciousness/title-generation')).toBe('true')
  })

  it('ignores storage events because Pinia owns cross-window synchronization', () => {
    const store = useConsciousnessSettingsStore()

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'settings/consciousness/reasoning',
      newValue: 'true',
    }))

    expect(store.reasoning).toBe(false)
  })
})
