import type { ReadAloud } from '@proj-airi/evals-tts-speech-formula'

import { toSpeechText } from '@proj-airi/core-agent'
import { voiceLanguage } from '@proj-airi/evals-tts-speech-formula'

/** `toSpeechText` of `@proj-airi/core-agent`, the rule engine that AIRI ships. The voice language selects the formula language. */
export const readAloud: ReadAloud = async (markdown, language) => toSpeechText(markdown, { language: voiceLanguage[language] })
