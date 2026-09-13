/**
 * Streaming splitter for one bilingual assistant turn (UST format).
 *
 * The model speaks naturally and puts the translation of each sentence in
 * square brackets immediately after it:
 *
 * ```text
 * Hello! [你好！] How are you? [你好吗？]
 * ```
 *
 * Spoken text outside brackets goes to TTS and the chat surface. Text
 * inside brackets goes to the translation subtitle hook only. One spoken
 * run and the bracketed translation that closes it share one `pairId`.
 *
 * The parser protects ordinary bracket uses:
 *
 * - Markdown links `[text](url)` pass through as spoken text.
 * - Numeric citations such as `[1]` pass through as spoken text.
 * - Nested or unclosed brackets pass through as spoken text.
 *
 * Alignment downstream is positional: the prompt requires one spoken
 * sentence (ending in sentence punctuation) per bracketed translation, so
 * TTS segmentation and playback order map one playback item to one pair
 * without comparing any text.
 */

export interface BilingualLanguageEntry {
  /** ISO 639-1 code, for example `en` or `zh`. */
  code: string
  /** Native language name shown in the settings page and on caption labels. */
  label: string
}

/**
 * Languages offered for the spoken and translated language selectors.
 */
export const BILINGUAL_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ru', label: 'Русский' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'th', label: 'ไทย' },
] as const satisfies readonly BilingualLanguageEntry[]

/**
 * Immutable settings for one turn. Capture this object before the turn
 * starts so mid-send setting changes do not affect the in-flight response.
 * The splitter itself is language-agnostic; these fields drive the model
 * instruction and the caption label.
 */
export interface BilingualTurnSnapshot {
  /** ISO 639-1 code of the language sent to TTS. */
  spokenLanguage: string
  /** ISO 639-1 code shown as the translated subtitle line. */
  translationLanguage: string
}

export type BilingualTurnEvent
  = | {
    /** Text for TTS and the spoken-language bubble projection. */
    kind: 'spoken'
    text: string
  }
  | {
    /** Text for the translated subtitle track. */
    kind: 'translation'
    /** Sentence-pair id. The spoken run and its bracket share one id. */
    pairId: number
    text: string
  }

export interface BilingualTurnSplitter {
  /** Feeds one LLM chunk and returns the events it produced. */
  consume: (chunk: string) => BilingualTurnEvent[]
  /**
   * Flushes held bytes at turn end. A bracket waiting for its look-ahead
   * character resolves as a translation; an unclosed bracket stays spoken.
   */
  end: () => BilingualTurnEvent[]
}

/**
 * Creates the streaming splitter for one turn.
 *
 * It is stateless regarding languages: the prompt names the pair of
 * languages, and the caption layer labels the translation track itself.
 */
export function createBilingualTurnSplitter(): BilingualTurnSplitter {
  /**
   * Parser mode:
   * - `normal`: outside brackets.
   * - `bracket`: inside `[ ...` waiting for `]`.
   * - `closed`: saw `[inner]`, waiting one character to rule out a markdown
   *   link (`[inner](`) before committing the bracket as a translation.
   */
  let mode: 'normal' | 'bracket' | 'closed' = 'normal'
  let bracketText = ''
  let bracketDepth = 0
  let pairId = 0

  function emitSpoken(events: BilingualTurnEvent[], text: string) {
    if (!text)
      return
    const last = events.at(-1)
    if (last?.kind === 'spoken')
      last.text += text
    else
      events.push({ kind: 'spoken', text })
  }

  /**
   * Resolves a closed bracket using the character that follows it.
   * Returns without consuming when there is no next character yet.
   */
  function resolveClosed(events: BilingualTurnEvent[], nextChar?: string) {
    const inner = bracketText
    bracketText = ''

    if (nextChar === undefined) {
      // End of stream: decide from content alone.
      mode = 'closed'
      bracketText = inner
      return
    }

    mode = 'normal'

    // Markdown link: `[inner](` — the bracket and the character are spoken.
    if (nextChar === '(') {
      emitSpoken(events, `[${inner}](`)
      return
    }

    // Nested brackets (matrix data, nested citations) never hold a
    // translation. Citations [1], [12] and empty brackets stay spoken too.
    const staysSpoken = inner.includes('[')
      || inner.includes(']')
      || /^\d*$/.test(inner)

    if (staysSpoken) {
      emitSpoken(events, `[${inner}]`)
      emitSpoken(events, nextChar)
      return
    }

    // Translation bracket. Spoken bytes already emitted carry this pairId;
    // publish the translation, then the next spoken run opens a new pair.
    if (inner.trim())
      events.push({ kind: 'translation', pairId, text: inner })
    else
      emitSpoken(events, '[]')
    pairId += 1

    emitSpoken(events, nextChar)
  }

  function consume(chunk: string): BilingualTurnEvent[] {
    const events: BilingualTurnEvent[] = []

    for (const char of chunk) {
      if (mode === 'normal') {
        if (char === '[') {
          mode = 'bracket'
          bracketText = ''
          bracketDepth = 1
        }
        else {
          emitSpoken(events, char)
        }
        continue
      }

      if (mode === 'bracket') {
        if (char === '[') {
          bracketDepth += 1
          bracketText += char
        }
        else if (char === ']') {
          bracketDepth -= 1
          if (bracketDepth === 0) {
            mode = 'closed'
            continue
          }
          bracketText += char
        }
        else {
          bracketText += char
        }
        continue
      }

      // mode === 'closed'
      resolveClosed(events, char)
    }

    return events
  }

  function end(): BilingualTurnEvent[] {
    const events: BilingualTurnEvent[] = []

    if (mode === 'bracket') {
      // Unclosed bracket: keep every byte on the spoken track.
      mode = 'normal'
      emitSpoken(events, `[${bracketText}`)
      bracketText = ''
    }
    else if (mode === 'closed') {
      // No look-ahead character arrived. Numeric content is a citation and
      // stays spoken; anything else is the final translation block.
      const inner = bracketText
      mode = 'normal'
      bracketText = ''
      if (/^\d*$/.test(inner))
        emitSpoken(events, `[${inner}]`)
      else if (inner.trim())
        events.push({ kind: 'translation', pairId, text: inner })
      else
        emitSpoken(events, '[]')
    }

    return events
  }

  return { consume, end }
}
