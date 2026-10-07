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
 * - A bracket that does not follow a sentence-ending punctuation mark passes
 *   through as spoken text, so code subscripts such as `arr[index]` and
 *   leading notes stay intact. The bilingual prompt requires every
 *   translation to follow a punctuated spoken sentence.
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
 * Projects a complete UST turn to its spoken-only text, dropping every
 * bracketed translation. The state machine is a char-pure function, so one
 * whole-text pass equals the streaming projection of the same text. Use when
 * persisting or replaying the turn after streaming finished.
 */
export function projectSpokenText(rawText: string): string {
  const splitter = createBilingualTurnSplitter()
  let spoken = ''
  for (const event of [...splitter.consume(rawText), ...splitter.end()]) {
    if (event.kind === 'spoken')
      spoken += event.text
  }
  return spoken
}

/**
 * Sentence-ending marks that can directly precede a translation bracket.
 * Matches the sentence boundary the bilingual prompt requires before each
 * bracket; a bracket after any other character is ordinary content.
 */
const sentenceEndingPunctuations = new Set('.。!?！？…⋯')

/** Closing quotes and brackets allowed between the sentence mark and `[`. */
const trailingSentenceChars = /[\s"'“”‘’「」)）]*$/

/**
 * A translation bracket can open only right after a punctuated spoken
 * sentence. Code subscripts (`arr[index]`), leading notes, and expressions
 * mid-sentence never satisfy this.
 */
function spokenRunEndsSentence(spokenRun: string): boolean {
  const last = spokenRun.replace(trailingSentenceChars, '').at(-1)
  return last !== undefined && sentenceEndingPunctuations.has(last)
}

/**
 * Bracket content that never holds a translation: nested brackets (matrix
 * data, nested citations), numeric citations, and empty brackets. Shared by
 * the look-ahead resolution and the end-of-stream resolution.
 */
function isOrdinaryBracketInner(inner: string): boolean {
  return inner.includes('[') || inner.includes(']') || /^\d*$/.test(inner)
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
  /**
   * Spoken text since the last translation pair. The next `[` becomes a
   * translation candidate only when this run ends in sentence punctuation.
   */
  let spokenRun = ''

  function emitSpoken(events: BilingualTurnEvent[], text: string) {
    if (!text)
      return
    spokenRun += text
    const last = events.at(-1)
    if (last?.kind === 'spoken')
      last.text += text
    else
      events.push({ kind: 'spoken', text })
  }

  /** Publishes one translation and starts the next spoken run. */
  function emitTranslation(events: BilingualTurnEvent[], text: string) {
    events.push({ kind: 'translation', pairId, text })
    pairId += 1
    spokenRun = ''
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
    if (isOrdinaryBracketInner(inner)) {
      emitSpoken(events, `[${inner}]`)
      emitSpoken(events, nextChar)
      return
    }

    // Translation bracket. Spoken bytes already emitted carry this pairId;
    // publish the translation, then the next spoken run opens a new pair.
    if (inner.trim())
      emitTranslation(events, inner)
    else
      emitSpoken(events, '[]')

    emitSpoken(events, nextChar)
  }

  function consume(chunk: string): BilingualTurnEvent[] {
    const events: BilingualTurnEvent[] = []

    for (const char of chunk) {
      if (mode === 'normal') {
        if (char === '[') {
          // Only a bracket right after a punctuated spoken sentence can be a
          // translation. Anything else (subscripts, leading notes) is spoken
          // byte for byte and never enters bracket state.
          if (spokenRunEndsSentence(spokenRun)) {
            mode = 'bracket'
            bracketText = ''
            bracketDepth = 1
          }
          else {
            emitSpoken(events, char)
          }
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
      // No look-ahead character arrived. Apply the same content
      // classification as the look-ahead branch, so a final nested
      // expression such as `[[1,2],[3,4]]` stays spoken at EOF too.
      const inner = bracketText
      mode = 'normal'
      bracketText = ''
      if (isOrdinaryBracketInner(inner))
        emitSpoken(events, `[${inner}]`)
      else if (inner.trim())
        emitTranslation(events, inner)
      else
        emitSpoken(events, '[]')
    }

    return events
  }

  return { consume, end }
}
