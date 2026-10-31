import type { VoiceInfo } from '../providers/types'

/**
 * A language that the current voice catalog offers.
 *
 * The code is the primary subtag, so `zh-CN` and `zh-TW` form one entry. A
 * user picks the language they speak, not the region of one voice.
 */
export interface SpeechLanguageOption {
  code: string
  title: string
}

/** Lowercases the primary subtag. Empty input gives an empty subtag. */
export function primarySubtag(code: string): string {
  const value = String(code ?? '').trim().toLowerCase()
  return value.split(/[-_]/)[0] ?? ''
}

/** True when the voice declares at least one usable language code. `und` means undetermined. */
function declaresLanguage(voice: VoiceInfo): boolean {
  return voice.languages.some((language) => {
    const code = primarySubtag(language.code)
    return code !== '' && code !== 'und'
  })
}

/** True when the voice speaks the wanted language. An empty language matches every voice. */
export function voiceSpeaksLanguage(voice: VoiceInfo, language: string): boolean {
  const wanted = primarySubtag(language)
  if (!wanted)
    return true
  return voice.languages.some(entry => primarySubtag(entry.code) === wanted)
}

/**
 * Collects the languages the catalog can speak, sorted by code.
 *
 * The catalog title wins over the raw code, because providers name their
 * languages for humans, for example `Chinese (Mandarin)`.
 */
export function collectVoiceLanguages(voices: VoiceInfo[]): SpeechLanguageOption[] {
  const byCode = new Map<string, string>()
  for (const voice of voices) {
    for (const language of voice.languages) {
      const code = primarySubtag(language.code)
      if (!code || code === 'und' || byCode.has(code))
        continue
      const title = String(language.title ?? '').trim()
      byCode.set(code, title || code.toUpperCase())
    }
  }
  return Array.from(byCode, ([code, title]) => ({ code, title }))
    .sort((left, right) => left.code.localeCompare(right.code))
}

/** Voices that speak the language. An empty language returns every voice. */
export function voicesForLanguage(voices: VoiceInfo[], language: string): VoiceInfo[] {
  const wanted = primarySubtag(language)
  if (!wanted)
    return voices
  return voices.filter(voice => voiceSpeaksLanguage(voice, language))
}

/**
 * Narrows the voice list for display.
 *
 * A voice without language data stays visible, because a provider can offer
 * voices it cannot describe. A voice that names another language leaves the
 * list, so the list shows what the chosen language can actually use.
 */
export function filterVoicesByLanguage(voices: VoiceInfo[], language: string): VoiceInfo[] {
  const wanted = primarySubtag(language)
  if (!wanted)
    return voices
  return voices.filter(voice => !declaresLanguage(voice) || voiceSpeaksLanguage(voice, language))
}
