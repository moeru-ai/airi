import type { SpeechTokenContext, SpeechTokenReader } from './types'

/**
 * A run of characters that can make an address or a path. CJK text ends a run, so `访问example.com吧` has the token
 * `example.com`. Private use characters belong to the run, because the speech stream marks a special token with one,
 * see `controlMarker` in ../../../response.
 */
const tokens = /[\w~.:/\\@%+?#=&[\]\p{Co}-]+/gu
/**
 * A token is a candidate only when a symbol is between its characters, or starts a path, as in `.env`, `~/a`, or `/etc`.
 * So `hello` and `end.` are not candidates.
 */
const innerSymbol = /\w[.:/\\@].|^[.~/][\w/\\]/
/** Punctuation that ends the sentence around a token, not the token. */
const trailingPunctuation = /[.,:;!?)]+$/
const markers = /\p{Co}/gu

/**
 * Reads each token of a text with the first reader that recognizes it. Other text stays as written.
 * Words have no place for a marker inside a token, so its markers follow the words.
 */
export function speakTokens(text: string, context: SpeechTokenContext, readers: readonly SpeechTokenReader[]): string {
  return text.replace(tokens, (match) => {
    const punctuation = trailingPunctuation.exec(match.replace(markers, ''))?.[0] ?? ''
    const token = match.replace(markers, '').slice(0, -punctuation.length || undefined)
    if (!innerSymbol.test(token))
      return match

    for (const reader of readers) {
      const words = reader.read(token, context)
      if (words !== undefined)
        return words + (match.match(markers)?.join('') ?? '') + punctuation
    }
    return match
  })
}
