const localeStorageKey = 'settings/language'

export interface HostLocale {
  get: () => Promise<string | undefined>
  set: (locale: string) => Promise<void>
}

export function useHostLocale(): HostLocale {
  return {
    async get() {
      return localStorage.getItem(localeStorageKey) || undefined
    },
    async set(locale) {
      localStorage.setItem(localeStorageKey, locale)
    },
  }
}
