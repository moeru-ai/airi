import type { BilingualLanguageCode } from './languages'

import { resolveBilingualLanguage } from './languages'
import { createBilingualParser } from './parser'

/** One spoken sentence, paired with the translation that followed it. */
export interface BilingualPair {
  /** Spoken sentence, tags stripped. Matches the pair to its playback item. */
  spoken: string
  /** Translation of that sentence. */
  translation: string
  /** Display name of the translation language, e.g. `中文`. */
  label: string
}

export interface BilingualTurnOptions {
  /**
   * ISO 639-1 codes the model may emit, spoken language first. The first one
   * also receives text that arrives before any tag.
   */
  languages: string[]
  /** Language the speech engine reads. Everything else is a translation. */
  ttsLanguage: string
  /** Receives the text that must be spoken. Tags are already stripped. */
  onSpoken: (text: string) => void
  /** Receives each sentence pair as the model closes it. */
  onPair: (pair: BilingualPair) => void
}

export interface BilingualTurn {
  /** Feeds one streamed chunk. A tag may be split across chunks. */
  push: (chunk: string) => void
  /** Flushes the trailing sentence at the end of the stream. */
  end: () => void
}

/**
 * Splits one turn of tagged model output into spoken text and sentence pairs.
 *
 * Use when:
 * - The model was asked to interleave `[EN] …` / `[CN] …`, and the spoken
 *   language has to reach the speech engine while each sentence's translation is
 *   published separately, in step with playback.
 *
 * Why shared:
 * - A chat turn and a spark reaction answer in the same format. Keeping the
 *   split here means both are paired by one implementation instead of two that
 *   drift apart.
 *
 * Expects:
 * - Chunks arrive in order, and `end()` is called once the stream finishes.
 *
 * Returns:
 * - A handle. Spoken text goes to `onSpoken`, completed pairs to `onPair`.
 */
export function createBilingualTurn(options: BilingualTurnOptions): BilingualTurn {
  const spokenLanguage: BilingualLanguageCode | undefined = resolveBilingualLanguage(options.ttsLanguage)?.code

  let spoken = ''
  let translation = ''
  let label = ''

  function flush() {
    if (spoken)
      options.onPair({ spoken: spoken.trim(), translation: translation.trim(), label })

    spoken = ''
    translation = ''
    label = ''
  }

  const parser = createBilingualParser({
    languages: options.languages,
    onText: (language, text) => {
      if (language.code === spokenLanguage) {
        // Output is interleaved, so returning to the spoken language means the
        // sentence before it is complete. Without a translation this is still
        // that same sentence, so what was collected has to be kept.
        if (translation)
          flush()

        spoken += text
        options.onSpoken(text)
        return
      }

      translation += text
      label = language.display
    },
  })

  return {
    push: chunk => parser.push(chunk),
    end: () => {
      parser.end()
      flush()
    },
  }
}
