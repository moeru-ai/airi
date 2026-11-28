// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useConsciousnessSettingsStore } from './consciousness-settings'

describe('consciousness settings store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('uses model default reasoning by default', () => {
    const store = useConsciousnessSettingsStore()

    expect(store.reasoning).toBe('default')
  })

  it.each(['default', 'enabled', 'disabled'] as const)('loads the persisted %s value', (mode) => {
    localStorage.setItem('settings/consciousness/reasoning', mode)
    const store = useConsciousnessSettingsStore()

    expect(store.reasoning).toBe(mode)
  })

  it.each(['true', 'false', 'invalid'])('falls back to default for unrecognized persisted value %s', (raw) => {
    localStorage.setItem('settings/consciousness/reasoning', raw)
    const store = useConsciousnessSettingsStore()

    expect(store.reasoning).toBe('default')
  })

  it('persists changes through store actions', async () => {
    const store = useConsciousnessSettingsStore()
    await store.setReasoning('enabled')

    expect(store.reasoning).toBe('enabled')
    expect(localStorage.getItem('settings/consciousness/reasoning')).toBe('enabled')

    await store.setReasoning('disabled')

    expect(store.reasoning).toBe('disabled')
    expect(localStorage.getItem('settings/consciousness/reasoning')).toBe('disabled')

    await store.resetState()

    expect(store.reasoning).toBe('default')
    expect(localStorage.getItem('settings/consciousness/reasoning')).toBe('default')
  })

  it('ignores storage events because Pinia owns cross-window synchronization', () => {
    const store = useConsciousnessSettingsStore()

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'settings/consciousness/reasoning',
      newValue: 'enabled',
    }))

    expect(store.reasoning).toBe('default')
  })
})
