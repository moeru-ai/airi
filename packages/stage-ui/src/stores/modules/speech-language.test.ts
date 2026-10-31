import type { VoiceInfo } from '../../libs/providers/types'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useProviderStore } from '../providers/provider'
import { useSpeechStore } from './speech'

const i18nState = vi.hoisted(() => ({
  locale: { value: 'en-US' },
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: i18nState.locale,
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

const PROVIDER = 'microsoft-speech'

function voice(id: string, languages: { code: string, title: string }[]): VoiceInfo {
  return { id, name: id, provider: PROVIDER, languages }
}

const chineseVoice = voice('huihui', [{ code: 'zh-CN', title: 'Chinese (Mandarin)' }])
const englishVoice = voice('zira', [{ code: 'en-US', title: 'English (United States)' }])
const japaneseVoice = voice('nanami', [{ code: 'ja-JP', title: 'Japanese' }])

describe('speech store · voice language', () => {
  beforeEach(() => {
    i18nState.locale.value = 'en-US'
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /** Loads a catalog into the active provider, the way the settings page does. */
  async function loadCatalog(voices: VoiceInfo[]) {
    const providers = useProviderStore()
    vi.spyOn(providers, 'listProviderVoices').mockResolvedValue(voices)
    const speech = useSpeechStore()
    speech.activeSpeechProvider = PROVIDER
    await new Promise(resolve => setTimeout(resolve, 20))
    await speech.loadVoicesForProvider(PROVIDER, 'v1')
    return speech
  }

  it('lists the languages of the loaded catalog', async () => {
    const speech = await loadCatalog([chineseVoice, englishVoice, japaneseVoice])
    expect(speech.speechLanguages.map(language => language.code)).toEqual(['en', 'ja', 'zh'])
  })

  it('moves off a voice that speaks another language', async () => {
    const speech = await loadCatalog([chineseVoice, japaneseVoice])
    speech.activeSpeechVoiceId = 'huihui'
    await speech.ensureActiveSpeechVoice()
    expect(speech.activeSpeechVoiceId).toBe('huihui')

    speech.activeSpeechLanguage = 'ja'
    await speech.ensureActiveSpeechVoice()
    // The selected voice cannot speak Japanese, so the character would answer in
    // Chinese. The language choice replaces it before the next sentence.
    expect(speech.activeSpeechVoiceId).toBe('nanami')
    expect(speech.activeSpeechVoice?.id).toBe('nanami')
  })

  it('keeps the chosen voice while no language is selected', async () => {
    const speech = await loadCatalog([chineseVoice, japaneseVoice])
    speech.activeSpeechVoiceId = 'huihui'
    speech.activeSpeechLanguage = ''
    await speech.ensureActiveSpeechVoice()
    expect(speech.activeSpeechVoiceId).toBe('huihui')
  })

  it('resets the language with the rest of the speech settings', async () => {
    const speech = await loadCatalog([chineseVoice, japaneseVoice])
    speech.activeSpeechLanguage = 'ja'
    await speech.resetSettings()
    expect(speech.activeSpeechLanguage).toBe('')
  })

  it('writes the chosen language into SSML', async () => {
    const speech = await loadCatalog([japaneseVoice])
    expect(speech.generateSSML('hello', japaneseVoice, {}, 'ja')).toContain('xml:lang="ja"')
    // Without a choice the voice's own first locale answers the tag.
    expect(speech.generateSSML('hello', japaneseVoice, {})).toContain('xml:lang="ja-JP"')
  })

  it('only replaces the voice after the catalog arrives', async () => {
    const speech = await loadCatalog([])
    speech.activeSpeechVoiceId = 'huihui'
    speech.activeSpeechLanguage = 'ja'
    await speech.ensureActiveSpeechVoice()
    await nextTick()
    // An empty catalog knows no replacement, so the saved selection survives.
    expect(speech.activeSpeechVoiceId).toBe('huihui')
  })
})
