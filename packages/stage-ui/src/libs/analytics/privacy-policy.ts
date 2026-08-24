import { localeRemap } from '@proj-airi/i18n'

const supportedPrivacyPolicyLocales = new Set([
  'en',
  'ja',
  'zh-Hans',
])

/** Returns the privacy policy URL for the requested UI locale. */
export function getAnalyticsPrivacyPolicyUrl(locale?: string): string {
  const normalizedLocale = localeRemap[locale ?? 'en'] ?? locale ?? 'en'
  const docsLocale = supportedPrivacyPolicyLocales.has(normalizedLocale)
    ? normalizedLocale
    : 'en'

  return `https://airi.moeru.ai/docs/${docsLocale}/about/privacy`
}
