import { localeRemap } from '@proj-airi/i18n'

// TODO: Replace this with docs-owned metadata so app links cannot drift from
// the actual locales published under docs/content/*/about/privacy.md.
const supportedPrivacyPolicyLocales = new Set([
  'en',
  'ja',
  'zh-Hans',
])

export function getAnalyticsPrivacyPolicyUrl(locale?: string): string {
  const normalizedLocale = localeRemap[locale ?? 'en'] ?? locale ?? 'en'
  const docsLocale = supportedPrivacyPolicyLocales.has(normalizedLocale)
    ? normalizedLocale
    : 'en'

  return `https://airi.moeru.ai/docs/${docsLocale}/about/privacy`
}
