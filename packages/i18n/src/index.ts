export const all = {
  'en': 'English',
  'es': 'Español',
  'fr': 'Français',
  'ja': '日本語',
  'ko': '한국어',
  'ru': 'Русский',
  'vi': 'Tiếng Việt',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
}

export const localeRemap: Record<string, string> = {
  'en': 'en',
  'en-AU': 'en',
  'en-GB': 'en',
  'en-US': 'en',
  'es': 'es',
  'es-AR': 'es',
  'es-ES': 'es',
  'es-MX': 'es',
  'fr': 'fr',
  'fr-FR': 'fr',
  'ja': 'ja',
  'ja-JP': 'ja',
  'ko': 'ko',
  'ko-KR': 'ko',
  'ru': 'ru',
  'ru-RU': 'ru',
  'vi': 'vi',
  'vi-VN': 'vi',
  'zh-CN': 'zh-Hans',
  'zh-Hans': 'zh-Hans',
  'zh-Hant': 'zh-Hant',
  'zh-HK': 'zh-Hant',
  'zh-TW': 'zh-Hant',
}

export function resolveSupportedLocale(
  locale: null | string | undefined,
  supportedLocales: readonly string[],
  fallbackLocale = 'en',
): string {
  const normalizedLocale = localeRemap[locale ?? fallbackLocale] ?? locale ?? fallbackLocale

  return supportedLocales.includes(normalizedLocale)
    ? normalizedLocale
    : fallbackLocale
}
