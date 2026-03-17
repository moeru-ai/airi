const privacyPolicyLocaleRemap: Record<string, string> = {
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hans',
  'zh-HK': 'zh-Hans',
  'zh-Hant': 'zh-Hans',
}

const supportedPrivacyPolicyLocales = new Set(['en', 'ja', 'zh-Hans'])

export function getAnalyticsPrivacyPolicyUrl(locale?: string): string {
  const normalizedLocale = privacyPolicyLocaleRemap[locale ?? 'en'] ?? locale ?? 'en'
  const docsLocale = supportedPrivacyPolicyLocales.has(normalizedLocale)
    ? normalizedLocale
    : 'en'

  return `https://airi.moeru.ai/docs/${docsLocale}/about/privacy`
}
