import type { BilingualTurnSnapshot } from '@proj-airi/pipelines-audio'

import { BILINGUAL_LANGUAGES } from '@proj-airi/pipelines-audio'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

/** Languages the settings page shows. */
export const bilingualLanguageOptions = BILINGUAL_LANGUAGES

function languageName(code: string): string {
  return BILINGUAL_LANGUAGES.find(language => language.code === code)?.label ?? code
}

const translationSamples: Record<string, [string, string]> = {
  en: ['Hello!', 'How are you?'],
  zh: ['你好！', '你好吗？'],
  ja: ['こんにちは！', '元気ですか？'],
  ko: ['안녕하세요!', '잘 지내세요?'],
  es: ['¡Hola!', '¿Cómo estás?'],
  fr: ['Bonjour !', 'Comment vas-tu ?'],
  de: ['Hallo!', 'Wie geht es dir?'],
  ru: ['Привет!', 'Как дела?'],
  pt: ['Olá!', 'Como você está?'],
  it: ['Ciao!', 'Come stai?'],
  vi: ['Xin chào!', 'Bạn khỏe không?'],
  th: ['สวัสดี!', 'สบายดีไหม?'],
}

/**
 * Builds the model instruction for bilingual UST output.
 *
 * The model speaks naturally and puts the translation of each sentence in
 * square brackets right after it. The TTS preprocessor strips the bracketed
 * translation before synthesis, and the bilingual splitter routes it to the
 * subtitle track. One short spoken sentence per pair keeps TTS segmentation
 * and playback order aligned one-to-one.
 */
export function buildBilingualInstruction(snapshot: BilingualTurnSnapshot): string {
  const spokenName = languageName(snapshot.spokenLanguage)
  const translationName = languageName(snapshot.translationLanguage)
  const [firstTranslation, secondTranslation] = translationSamples[snapshot.translationLanguage]
    ?? translationSamples.en!

  return [
    'Bilingual subtitle mode is ON for this whole reply.',
    `Speak naturally in ${spokenName}. Immediately after EACH spoken sentence, write its ${translationName} translation inside square brackets.`,
    'Rules:',
    '- Write one short sentence at a time, at most 12 spoken words, ending with sentence punctuation.',
    '- Format every pair as: <spoken sentence> [<translation>]',
    `- Put ONLY the ${translationName} translation inside the brackets: no spoken text, notes, or stage directions.`,
    '- Each bracket translates exactly the sentence before it. Never join two sentences in one bracket pair.',
    '- Never put language tags inside the brackets.',
    '- Write markdown links in normal markdown form. Do not bracket anything except translations.',
    '- Continue this alternating pattern for the entire reply without explaining it.',
    '',
    'Example:',
    `Hello! [${firstTranslation}] How are you? [${secondTranslation}]`,
  ].join('\n')
}

export const useSettingsBilingualSubtitles = defineStore('settings-bilingual-subtitles', () => {
  // Only the Stage host window reads these values, so this store stays out of
  // pinia-plugin-synced. The caption window receives translated text through
  // the caption broadcast channel.
  const enabled = useLocalStorageManualReset<boolean>('settings/bilingual/enabled', false)
  const spokenLanguage = useLocalStorageManualReset<string>('settings/bilingual/spoken-language', 'en')
  const translationLanguage = useLocalStorageManualReset<string>(
    'settings/bilingual/translation-language',
    'zh',
  )

  /**
   * Returns the immutable snapshot for one send, or undefined when disabled.
   * A translation in the spoken language adds no second track.
   */
  function snapshot(): BilingualTurnSnapshot | undefined {
    if (!enabled.value || !spokenLanguage.value || !translationLanguage.value)
      return undefined
    if (translationLanguage.value === spokenLanguage.value)
      return undefined

    return {
      spokenLanguage: spokenLanguage.value,
      translationLanguage: translationLanguage.value,
    }
  }

  /** Returns the model instruction for the current settings, or undefined. */
  function instruction(): string | undefined {
    const current = snapshot()
    if (!current)
      return undefined
    return buildBilingualInstruction(current)
  }

  function resetState() {
    enabled.reset()
    spokenLanguage.reset()
    translationLanguage.reset()
  }

  return {
    enabled,
    spokenLanguage,
    translationLanguage,
    snapshot,
    instruction,
    resetState,
  }
})
