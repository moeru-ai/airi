import type { SpeechPreprocessor } from '../types'

import { speakAddress } from './addresses'

export { speakAddress } from './addresses'

/**
 * Reads an inline code or a link text that is one web address as words of its sentence, for example
 * `https://home.example.com` as `https home 点 example 点 com`. An address in prose stays as written.
 */
export function addressSpeechPreprocessor(): SpeechPreprocessor {
  return {
    name: 'address',
    prose: (text, { kind, link, language }) => (kind === 'code' || link ? speakAddress(text, language) : undefined) ?? text,
  }
}
