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

  it('disables model thinking by default', () => {
    const store = useConsciousnessSettingsStore()

    expect(store.disableThinking).toBe(true)
  })

  it('restores the default after the disabled value is persisted', async () => {
    const store = useConsciousnessSettingsStore()
    store.disableThinking = false
    await nextTick()

    expect(localStorage.getItem('settings/consciousness/disable-thinking')).toBe('false')

    store.resetState()
    await nextTick()

    expect(store.disableThinking).toBe(true)
    expect(localStorage.getItem('settings/consciousness/disable-thinking')).toBe('true')
  })

  it('ignores storage events because Pinia owns cross-window synchronization', () => {
    const store = useConsciousnessSettingsStore()

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'settings/consciousness/disable-thinking',
      newValue: 'false',
    }))

    expect(store.disableThinking).toBe(true)
  })
})
