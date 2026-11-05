import type { SpeakText } from '@proj-airi/evals-tts-speech-text'

/** The reply as the model wrote it, with no emotion. This is the lower reference. */
export const speakText: SpeakText = async markdown => ({ text: markdown, emotions: [] })
