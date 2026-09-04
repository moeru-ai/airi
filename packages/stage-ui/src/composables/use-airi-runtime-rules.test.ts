import { describe, expect, it, vi } from 'vitest'

import { useAiriRuntimeRules } from './use-airi-runtime-rules'

const i18nMock = vi.hoisted(() => ({
  hasTranslation: vi.fn<(key: string, locale: string) => boolean>(),
  locale: { value: 'en' },
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: i18nMock.locale,
    t: (key: string) => key,
    te: (key: string, currentLocale: string) => i18nMock.hasTranslation(key, currentLocale),
  }),
}))

describe('useAiriRuntimeRules', () => {
  it('keeps a legacy locale prompt until Crowdin provides every split key', () => {
    i18nMock.locale.value = 'es'
    i18nMock.hasTranslation.mockReturnValue(false)

    const rules = useAiriRuntimeRules()

    expect(rules.defaultCharacterPrompt.value).toBe('base.prompt.prefix')
    expect(rules.runtimeRuleSet.value).toBeUndefined()
    expect(rules.runtimeRulesText.value).toBe('')
  })

  it('creates independent runtime rules after a locale has all split keys', () => {
    i18nMock.locale.value = 'en'
    i18nMock.hasTranslation.mockReturnValue(true)

    const rules = useAiriRuntimeRules()

    expect(rules.defaultCharacterPrompt.value).toBe('base.prompt.character')
    expect(rules.runtimeRuleSet.value?.emotion).toContain('base.prompt.emotion')
    expect(rules.runtimeRuleSet.value?.emoji).toBe('base.prompt.emoji')
  })
})
