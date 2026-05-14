import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSettingsGeneral } from './general'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

describe('store settings-general', () => {
  let store: Record<string, string>
  let localStorageMock: Storage

  beforeEach(() => {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false })
    setActivePinia(pinia)

    store = {}
    localStorageMock = {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { store[key] = value }),
      removeItem: vi.fn((key: string) => { delete store[key] }),
      clear: vi.fn(() => { for (const key in store) delete store[key] }),
      length: 0,
      key: vi.fn(() => null),
    } as unknown as Storage

    vi.stubGlobal('localStorage', localStorageMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ROOT CAUSE:
  // https://github.com/moeru-ai/airi/issues/1658
  // When Electron client is fully restarted, renderer localStorage may not be
  // flushed to disk. On next startup, getLanguage() finds no persisted value
  // and falls back to navigator.language (OS locale), ignoring the user's
  // previous selection.
  it('issue #1658: falls back to navigator.language when localStorage is empty', () => {
    // Simulate Electron restart where localStorage for language is lost
    vi.stubGlobal('navigator', { language: 'zh-CN' })

    const settingsStore = useSettingsGeneral()
    const resolvedLanguage = settingsStore.getLanguage()

    // navigator.language 'zh-CN' gets remapped to 'zh-Hans'
    expect(resolvedLanguage).toBe('zh-Hans')
    expect(localStorageMock.getItem).toHaveBeenCalledWith('settings/language')
  })

  it('issue #1658: returns persisted language when localStorage has a value', () => {
    // User previously selected Traditional Chinese
    store['settings/language'] = 'zh-Hant'
    vi.stubGlobal('navigator', { language: 'zh-CN' })

    const settingsStore = useSettingsGeneral()
    const resolvedLanguage = settingsStore.getLanguage()

    // Should respect the persisted language, not fallback to navigator.language
    expect(resolvedLanguage).toBe('zh-Hant')
  })
})
