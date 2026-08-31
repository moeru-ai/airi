import { describe, expect, it } from 'vitest'

import { all, resolveSupportedLocale } from './index'

const supportedLocales = Object.keys(all)

describe('resolveSupportedLocale', () => {
  it.each([
    ['zh-TW', 'zh-Hant'],
    ['zh-HK', 'zh-Hant'],
    ['zh-Hant', 'zh-Hant'],
    ['zh-CN', 'zh-Hans'],
    ['zh-Hans', 'zh-Hans'],
    ['en-US', 'en'],
    ['en-GB', 'en'],
    ['es-MX', 'es'],
    ['fr-FR', 'fr'],
    ['ja-JP', 'ja'],
    ['ko-KR', 'ko'],
    ['ru-RU', 'ru'],
    ['vi-VN', 'vi'],
  ])('maps %s to the supported locale %s', (locale, expected) => {
    expect(resolveSupportedLocale(locale, supportedLocales)).toBe(expected)
  })

  it('falls back to English for an unsupported locale', () => {
    expect(resolveSupportedLocale('de-DE', supportedLocales)).toBe('en')
  })

  it('uses the fallback when the locale is absent', () => {
    expect(resolveSupportedLocale(undefined, supportedLocales, 'zh-Hant')).toBe('zh-Hant')
  })
})
