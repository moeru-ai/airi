import { all, localeRemap } from '@proj-airi/i18n'

const supportedPrivacyPolicyLocales = new Set(Object.keys(all))

export function getAnalyticsPrivacyPolicyUrl(locale?: string): string {
  const normalizedLocale = localeRemap[locale ?? 'en'] ?? locale ?? 'en'
  const docsLocale = supportedPrivacyPolicyLocales.has(normalizedLocale)
    ? normalizedLocale
    : 'en'

  return `https://airi.moeru.ai/docs/${docsLocale}/about/privacy`
}
