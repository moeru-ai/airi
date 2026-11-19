/** What a token reader knows about the token that it reads. */
export interface SpeechTokenContext {
  /** The language of the sentence around the token, as a primary language subtag. */
  language: string
  /** `text` for prose, `code` for inline code. Prose has stricter rules, so `e.g` is not a file name. */
  kind: 'text' | 'code'
}

/**
 * Reads one kind of token as words, for example web addresses or file paths.
 *
 * `read` returns the words when it recognizes the token, and `undefined` otherwise. The token plugin asks its readers
 * in order and uses the first answer. A token that no reader recognizes stays as written.
 */
export interface SpeechTokenReader {
  /** A unique name, for logs and tests, for example `address`. */
  name: string
  read: (token: string, context: SpeechTokenContext) => string | undefined
}
