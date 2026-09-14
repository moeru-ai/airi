import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useHostLocale } from './locale'

vi.mock('./owner', () => ({
  initializeHostContext: () => ({
    context: {},
    runtime: 'kirie',
  }),
}))

const localeStorageKey = 'settings/language'

describe('kirie host locale', () => {
  beforeEach(() => {
    localStorage.removeItem(localeStorageKey)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.removeItem(localeStorageKey)
  })

  it('returns no locale when renderer storage is empty', async () => {
    await expect(useHostLocale().get()).resolves.toBeUndefined()
  })

  it('persists and reads the renderer locale', async () => {
    const locale = useHostLocale()

    await locale.set('ja')

    expect(localStorage.getItem(localeStorageKey)).toBe('ja')
    await expect(locale.get()).resolves.toBe('ja')
  })

  it('propagates a renderer storage error', async () => {
    const error = new DOMException('Locale storage is full.', 'QuotaExceededError')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw error
    })

    await expect(useHostLocale().set('ja')).rejects.toBe(error)
  })
})
