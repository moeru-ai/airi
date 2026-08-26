import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import { useLanguage } from './use-language'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'en' },
  }),
}))

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

vi.mock('@proj-airi/stage-shared/composables', () => ({
  useLocalStorageManualReset: vi.fn((key: string, initialValue: string) => {
    // Tests control persisted state by pre-seeding localStorage before each case
    const stored = localStorageMock.getItem(key)
    const value = stored !== null ? stored : initialValue
    return ref(value)
  }),
}))

describe('useLanguage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorageMock.clear()
  })

  // ROOT CAUSE:
  // https://github.com/moeru-ai/airi/issues/1658
  // When Electron restarts, renderer localStorage may not be flushed.
  // The store's onMounted hook falls back to navigator.language, then
  // watch(language) propagates that wrong locale back to main config.
  // useLanguage prevents this by guarding sync until the correct
  // locale is restored from the main-process config.
  it('issue #1658: restores correct locale from main process when store fallback is wrong', async () => {
    const language = ref('zh-Hans') // simulate store fallback to OS locale
    const getMainLocale = vi.fn(async () => 'zh-Hant') // main has user selection
    const setLocale = vi.fn(async () => {})

    // No persisted language in localStorage → renderer lost its setting
    const { restore } = useLanguage(language, getMainLocale, setLocale)
    await restore()

    expect(getMainLocale).toHaveBeenCalledTimes(1)
    expect(language.value).toBe('zh-Hant')
    expect(setLocale).toHaveBeenCalledWith('zh-Hant')
  })

  it('issue #1658: does not change language when main locale matches store', async () => {
    const language = ref('zh-Hant')
    const getMainLocale = vi.fn(async () => 'zh-Hant')
    const setLocale = vi.fn(async () => {})

    const { restore } = useLanguage(language, getMainLocale, setLocale)
    await restore()

    expect(language.value).toBe('zh-Hant')
    expect(setLocale).toHaveBeenCalledWith('zh-Hant')
  })

  it('does not overwrite valid renderer locale when persisted language exists', async () => {
    localStorage.setItem('settings/language', 'ja')

    const language = ref('ja') // user explicitly set this before
    const getMainLocale = vi.fn(async () => 'en')
    const setLocale = vi.fn(async () => {})

    const { restore } = useLanguage(language, getMainLocale, setLocale)
    await restore()

    // Should NOT call getMainLocale because renderer has persisted value
    expect(getMainLocale).not.toHaveBeenCalled()
    expect(language.value).toBe('ja')
    expect(setLocale).toHaveBeenCalledWith('ja')
  })

  it('preserves OS locale on first launch when main has no saved language', async () => {
    const language = ref('zh-Hans') // OS-detected fallback
    const getMainLocale = vi.fn(async () => undefined) // no config file yet
    const setLocale = vi.fn(async () => {})

    const { restore } = useLanguage(language, getMainLocale, setLocale)
    await restore()

    expect(getMainLocale).toHaveBeenCalledTimes(1)
    expect(language.value).toBe('zh-Hans') // keep OS fallback
    expect(setLocale).toHaveBeenCalledWith('zh-Hans')
  })

  it('restores explicit English choice after localStorage loss', async () => {
    const language = ref('zh-Hans') // store fallback to OS locale
    const getMainLocale = vi.fn(async () => 'en') // user explicitly chose English
    const setLocale = vi.fn(async () => {})

    const { restore } = useLanguage(language, getMainLocale, setLocale)
    await restore()

    expect(getMainLocale).toHaveBeenCalledTimes(1)
    expect(language.value).toBe('en')
    expect(setLocale).toHaveBeenCalledWith('en')
  })

  it('continues startup when getMainLocale fails', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const language = ref('zh-Hans')
    const getMainLocale = vi.fn(async () => {
      throw new Error('IPC timeout')
    })
    const setLocale = vi.fn(async () => {})

    const { restore } = useLanguage(language, getMainLocale, setLocale)
    await restore()

    // Should not throw; should still enable sync and use current value
    expect(language.value).toBe('zh-Hans')
    expect(setLocale).toHaveBeenCalledWith('zh-Hans')
    expect(consoleSpy).toHaveBeenCalledWith(
      '[useLanguage] Failed to get locale from main process, using fallback:',
      expect.any(Error),
    )

    consoleSpy.mockRestore()
  })

  it('does not sync to main before restore is called', () => {
    const language = ref('en')
    const getMainLocale = vi.fn(async () => 'en')
    const setLocale = vi.fn(async () => {})

    useLanguage(language, getMainLocale, setLocale)

    // Simulate the store's onMounted fallback changing language
    language.value = 'zh-Hans'

    expect(setLocale).not.toHaveBeenCalled()
  })

  it('syncs to main after restore is called', async () => {
    const language = ref('en')
    const getMainLocale = vi.fn(async () => 'en')
    const setLocale = vi.fn(async () => {})

    const { restore } = useLanguage(language, getMainLocale, setLocale)
    await restore()

    // Clear the restore() call so we only assert the post-restore sync
    setLocale.mockClear()

    // Now changes should propagate
    language.value = 'ja'
    await nextTick()

    expect(setLocale).toHaveBeenCalledWith('ja')
  })
})
