import type { SpeechPreprocessor } from '../types'
import type { SpeechTokenReader } from './types'

import { addressReader } from './address'
import { pathReader } from './path'
import { speakTokens } from './tokens'

export { addressReader } from './address'
export { pathReader } from './path'
export { speakTokens } from './tokens'
export type { SpeechTokenContext, SpeechTokenReader } from './types'

/** The default token readers: addresses first, because `example.com/docs` is also a valid relative path. */
export function defaultTokenReaders(): SpeechTokenReader[] {
  return [addressReader, pathReader]
}

/**
 * Reads tokens such as web addresses and file paths as words of their sentence, in prose, inline code, and link text.
 * For example `https://home.example.com` reads as `https home 点 example 点 com`. A token that no reader recognizes
 * stays as written. To add a reading, pass `readers: [myReader, ...defaultTokenReaders()]`.
 */
export function tokenSpeechPreprocessor(options?: { readers?: readonly SpeechTokenReader[] }): SpeechPreprocessor {
  const readers = options?.readers ?? defaultTokenReaders()
  return {
    name: 'token',
    prose: (text, { kind, language }) => speakTokens(text, { kind, language }, readers),
  }
}
