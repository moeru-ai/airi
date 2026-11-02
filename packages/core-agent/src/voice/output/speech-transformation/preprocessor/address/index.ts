import type { SpeechPreprocessor } from '../types'

import { speakAddresses } from './addresses'

export { speakAddresses } from './addresses'

/**
 * Reads web addresses in prose and in inline code as words of their sentence, for example
 * `https://assistant.ihome.cat` as `https assistant 点 ihome 点 cat`.
 */
export function addressSpeechPreprocessor(): SpeechPreprocessor {
  return {
    name: 'address',
    prose: (text, { language }) => speakAddresses(text, language),
  }
}
