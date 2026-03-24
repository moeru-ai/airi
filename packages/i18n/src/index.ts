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
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
  'zh-HK': 'zh-Hans',
  'zh-Hant': 'zh-Hant',
  'zh-Hans': 'zh-Hans',
  'en': 'en',
  'en-US': 'en',
  'en-GB': 'en',
  'en-AU': 'en',
  'es': 'es',
  'es-ES': 'es',
  'es-MX': 'es',
  'es-AR': 'es',
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
}

export function resolveSupportedLocale(
  locale: string | null | undefined,
  supportedLocales: readonly string[],
  fallbackLocale = 'en',
): string {
  const normalizedLocale = localeRemap[locale ?? fallbackLocale] ?? locale ?? fallbackLocale

  return supportedLocales.includes(normalizedLocale)
    ? normalizedLocale
    : fallbackLocale
}
