import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSettingsBilingual } from '../stores/settings/bilingual'
import { useAiriRuntimePrompt } from './use-airi-runtime-prompt'

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

describe('useAiriRuntimePrompt', () => {
  // The composable reads the bilingual settings store, so a Pinia instance has
  // to be active before it runs.
  beforeEach(() => {
    setActivePinia(createPinia())
    i18nMock.hasTranslation.mockReturnValue(true)
  })

  it('returns no prompt for a locale that still uses the combined prompt', () => {
    i18nMock.hasTranslation.mockReturnValue(false)

    expect(useAiriRuntimePrompt().value).toBe('')
  })

  it('assembles the emotion and emoji prompt for a split locale', () => {
    const prompt = useAiriRuntimePrompt().value

    expect(prompt).toContain('base.prompt.emotion')
    expect(prompt).toContain('base.prompt.suffix')
    expect(prompt).toContain('base.prompt.emoji')
  })

  it('leaves the bilingual instruction out while the feature is off', () => {
    const prompt = useAiriRuntimePrompt({ bilingual: true }).value

    expect(prompt).not.toContain('Respond in English.')
  })

  // Consumers that never parse the language tags (spark notifications) must not
  // receive the instruction, or their output is stored with raw [EN]/[CN] tags.
  it('leaves the bilingual instruction out for consumers that do not opt in', () => {
    useSettingsBilingual().enabled = true

    const prompt = useAiriRuntimePrompt().value

    expect(prompt).not.toContain('Respond in English.')
  })

  it('appends the bilingual instruction once the feature is on', () => {
    useSettingsBilingual().enabled = true

    const prompt = useAiriRuntimePrompt({ bilingual: true }).value

    expect(prompt).toContain('Respond in English.')
    expect(prompt).toContain('[EN] <text in English>')
    expect(prompt).toContain('[CN] <text in 中文>')
  })

  // Locales such as zh-Hant and ja ship no `base.prompt.emotion` key. Gating
  // the bilingual instruction on those keys silently disabled the feature for
  // them, so the instruction has to stand on its own.
  it('keeps the bilingual instruction for a locale without the split prompt keys', () => {
    i18nMock.hasTranslation.mockReturnValue(false)
    useSettingsBilingual().enabled = true

    const prompt = useAiriRuntimePrompt({ bilingual: true }).value

    expect(prompt).toContain('Respond in English.')
    expect(prompt).toContain('[EN] <text in English>')
  })
})
