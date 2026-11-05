import type { SpeakText } from '@proj-airi/evals-tts-speech-text'

import { toSpeechText } from '@proj-airi/core-agent'
import { voiceLanguage } from '@proj-airi/evals-tts-speech-text'

/**
 * The Unicode blocks that the `filter_emoji` text transform of LiveKit Agents removes: pictographs and symbols
 * U+1F000 to U+1FBFF, miscellaneous symbols and dingbats U+2600 to U+27BF, arrows and symbols U+2B00 to U+2BFF,
 * variation selectors, the zero width joiner, and the keycap mark.
 * Source: `livekit-agents/livekit/agents/voice/transcription/filters.py` of livekit/agents, read on 2026-11-05.
 */
const emoji = /[\u{1F000}-\u{1FBFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu

/**
 * The default TTS text transforms of LiveKit Agents, `filter_markdown` then `filter_emoji`: the industry baseline that
 * only removes Unicode emoji. The markdown step is the AIRI one, so the comparison differs only in the emoticon step.
 */
export const speakText: SpeakText = async (markdown, language) => ({
  text: toSpeechText(markdown, { language: voiceLanguage[language] }).replace(emoji, ''),
  emotions: [],
})
