import type { BilingualLanguage } from './languages'

import { resolveBilingualLanguage } from './languages'

/**
 * Longest run the parser holds back while deciding whether a `[` opened a
 * language tag. Generous enough for tags such as `[ZH-HANS]`; anything longer
 * is treated as literal text.
 */
const MAX_TAG_LENGTH = 12

export interface BilingualParserOptions {
  /**
   * ISO 639-1 codes the model may emit, in prompt order. Text arriving before
   * the first tag is routed to the first one, so a model that ignores the
   * instruction still produces usable output.
   */
  languages: string[]
  /** Called with each routed chunk. Tags are never part of the text. */
  onText: (language: BilingualLanguage, text: string) => void
}

export interface BilingualParser {
  /** Feeds one streamed chunk. A tag may be split across chunks. */
  push: (chunk: string) => void
  /** Flushes text held back at the end of the stream. */
  end: () => void
}

/**
 * Splits a stream of model output into per-language chunks.
 *
 * Use when:
 * - The model was asked to label every segment, e.g. `[EN] ...` / `[CN] ...`,
 *   and each language has to reach a different consumer.
 *
 * Expects:
 * - Chunks arrive in order and are never reordered.
 *
 * Returns:
 * - A handle. Text is delivered through `options.onText`, grouped per `push`
 *   and split at every language switch.
 */
export function createBilingualParser(options: BilingualParserOptions): BilingualParser {
  const languages = options.languages
    .map(code => resolveBilingualLanguage(code))
    .filter((language): language is BilingualLanguage => language != null)

  let current = languages[0]
  /** Characters held back while the parser decides whether `[` opened a tag. */
  let pending = ''
  let readingTag = false

  /** Consumes `pending` as a language tag. Returns false when it is not one. */
  function tryConsumeTag(): boolean {
    const raw = pending.slice(1, -1).trim().toUpperCase()
    const matched = languages.find(language => language.tag === raw)
    if (!matched)
      return false

    current = matched
    return true
  }

  return {
    push(chunk) {
      if (!current)
        return

      let out = ''
      // Language `out` belongs to. It lags behind `current` while text
      // accumulated before a tag is still waiting to be flushed.
      let outLanguage = current

      function flushOut() {
        if (out)
          options.onText(outLanguage, out)
        out = ''
        outLanguage = current
      }

      for (const char of chunk) {
        if (readingTag) {
          pending += char

          if (char === ']') {
            if (tryConsumeTag()) {
              // A real tag: everything buffered before it belongs to the
              // language that was active until now.
              flushOut()
            }
            else {
              // Not a tag after all, so keep it as literal text.
              out += pending
            }
            pending = ''
            readingTag = false
            continue
          }

          if (pending.length >= MAX_TAG_LENGTH) {
            out += pending
            pending = ''
            readingTag = false
          }
          continue
        }

        if (char === '[') {
          readingTag = true
          pending = '['
          continue
        }

        if (out === '')
          outLanguage = current
        out += char
      }

      flushOut()
    },
    end() {
      if (!readingTag || !pending)
        return

      // The stream ended inside a candidate tag, so it was literal text.
      if (current)
        options.onText(current, pending)

      pending = ''
      readingTag = false
    },
  }
}
