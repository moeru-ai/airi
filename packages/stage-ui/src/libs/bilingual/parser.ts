import type { BilingualLanguage } from './languages'

import { resolveBilingualLanguage } from './languages'

/**
 * Longest run the parser holds back while deciding whether a `[` opened a
 * language tag. Catalogue tags are two letters, so this is generous; anything
 * longer is treated as literal text.
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
    // One spelling per language, the one the prompt teaches, compared without
    // case. Anything else stays literal text: an invented tag is read aloud
    // instead of moving the text to a line nothing is listening for.
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

/**
 * Reduces tagged model output to a single language, dropping every tag.
 *
 * Use when:
 * - Content that is never parsed for captions has to stay free of the
 *   `[EN]`/`[CN]` control tags: the chat bubble, the stored history and the
 *   history sent back to the model.
 *
 * Returns:
 * - The text of `keep` only. Text before the first tag belongs to the first
 *   configured language, matching the parser's own fallback.
 */
export function projectBilingualText(text: string, languages: string[], keep: string): string {
  let out = ''

  const parser = createBilingualParser({
    languages,
    onText: (language, chunk) => {
      if (language.code === keep)
        out += chunk
    },
  })

  parser.push(text)
  parser.end()

  return out
}

/**
 * Cuts an unfinished tag candidate off the end of streamed text.
 *
 * A provider may deliver `[EN]` in several pieces, so a patch of a reply that is
 * still streaming can end inside a candidate — `[`, `[EN`. Projecting such a
 * patch flushes the candidate as literal text, and the bubble shows a bracket
 * until the next patch resolves it. The finished reply never goes through this:
 * there a `[` with no closing bracket is a real character and is kept.
 */
export function trimIncompleteBilingualTag(text: string, languages: string[]): string {
  const open = text.lastIndexOf('[')
  if (open < 0 || text.includes(']', open))
    return text

  // Only a candidate that can still grow into one of the configured tags is
  // held back. An ordinary bracket — an array index, a markdown link — is part
  // of the text being read: it reaches the bubble half-written while it
  // streams, and cutting at it would hide the rest of the sentence until the
  // closing bracket arrives, or for good when it never does.
  const candidate = text.slice(open + 1).toLowerCase()

  // The candidate is the start of a tag, so match it against the tags the model
  // is asked to emit — not the persisted codes. `zh` does not start with `c`, so
  // matching on the code would let a split `[CN` reach the bubble as literal
  // text, even though `CN` is the Chinese tag the parser accepts.
  const tags = languages
    .map(code => resolveBilingualLanguage(code)?.tag.toLowerCase())
    .filter((tag): tag is string => tag != null)

  return tags.some(tag => tag.startsWith(candidate))
    ? text.slice(0, open)
    : text
}
