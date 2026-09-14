import { defineInvoke } from '@moeru/eventa'

import { i18nGetLocale, i18nSetLocale } from '../../shared/eventa'
import { initializeHostContext } from './owner'

const localeStorageKey = 'settings/language'

export interface HostLocale {
  get: () => Promise<string | undefined>
  set: (locale: string) => Promise<void>
}

export function useHostLocale(): HostLocale {
  const host = initializeHostContext()
  if (host.runtime === 'electron') {
    return {
      get: defineInvoke(host.context, i18nGetLocale),
      set: defineInvoke(host.context, i18nSetLocale),
    }
  }

  return {
    async get() {
      return localStorage.getItem(localeStorageKey) || undefined
    },
    async set(locale) {
      localStorage.setItem(localeStorageKey, locale)
    },
  }
}
