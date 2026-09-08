import type { BilingualLanguage } from './languages'

import { resolveBilingualLanguage } from './languages'

export interface BilingualPromptOptions {
  /** Persisted value of the language the TTS engine will speak. */
  ttsLanguage: string
  /** Persisted values of the subtitle lines, in display order. */
  subtitleLanguages: string[]
}

/**
 * Builds the instruction that asks the model to answer in the TTS language
 * and label every subtitle segment with its language tag.
 *
 * Use when:
 * - Injecting the bilingual instruction into the system prompt.
 * - Previewing that instruction in settings before it reaches the model.
 *
 * Returns:
 * - The instruction, or an empty string when the TTS language is unknown or
 *   no subtitle language is selected. Callers can skip an empty instruction.
 */
export function buildBilingualPrompt(options: BilingualPromptOptions): string {
  const tts = resolveBilingualLanguage(options.ttsLanguage)
  const subtitles = options.subtitleLanguages
    .map(value => resolveBilingualLanguage(value))
    .filter((language): language is BilingualLanguage => language != null)

  if (!tts || subtitles.length === 0)
    return ''

  const lines: string[] = [`Respond in ${tts.display}.`]

  // The first subtitle line often repeats the spoken language, in which case
  // it is the answer itself rather than a translation of it.
  const translations = subtitles.filter(language => language.code !== tts.code)

  if (translations.length > 0) {
    const displays = translations.map(language => language.display).join(' and ')
    // Interleaved, not grouped: each sentence is followed by its own
    // translation so the overlay can pair them sentence by sentence.
    lines.push('', `Immediately after every sentence, give its ${displays} translation. Never group the translation at the end of the reply.`)
    lines.push('', 'Put every segment on its own line, prefixed with its language tag, and alternate between a sentence and its translation:', '')

    for (const language of translations) {
      lines.push(`[${tts.tag}] <text in ${tts.display}>`)
      lines.push(`[${language.tag}] <text in ${language.display}>`)
      lines.push(`[${tts.tag}] <next sentence in ${tts.display}>`)
      lines.push(`[${language.tag}] <its ${language.display} translation>`)
    }
  }
  else {
    lines.push('', 'Put every segment on its own line, prefixed with its language tag:', '')
    lines.push(`[${tts.tag}] <text in ${tts.display}>`)
  }

  return lines.join('\n')
}
