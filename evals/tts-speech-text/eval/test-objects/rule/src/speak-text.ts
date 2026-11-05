import type { SpeakText } from '@proj-airi/evals-tts-speech-text'
import type { StreamingControlEmotion } from '@proj-airi/pipelines-audio'

import { VoiceController } from '@proj-airi/core-agent'
import { voiceLanguage } from '@proj-airi/evals-tts-speech-text'
import { normalizeActPayload, Playback } from '@proj-airi/pipelines-audio'

const actPrefix = '<|ACT '
const actSuffix = '|>'

/** The emotion of an ACT token. Other special tokens and ACT tokens without an emotion have none. */
function emotionOf(special: string): StreamingControlEmotion | undefined {
  const token = special.trim()
  if (!token.startsWith(actPrefix) || !token.endsWith(actSuffix))
    return undefined
  try {
    return normalizeActPayload(JSON.parse(token.slice(actPrefix.length, -actSuffix.length))).emotion?.name
  }
  catch {
    return undefined
  }
}

/** A model streams a reply in small pieces, so an emoticon can arrive split over two writes. */
const writeSize = 3

/**
 * The speech output of AIRI: the reply goes through a `VoiceController` response as a model stream would, and the
 * adapter records the text of every TTS request and the emotion of every ACT token that playback reaches.
 * The playback plays nothing, so the run needs no TTS provider.
 */
export const speakText: SpeakText = async (markdown, language) => {
  const requests: string[] = []
  const emotions: StreamingControlEmotion[] = []
  const playback = new Playback({ nowMs: () => 0, play: () => ({ done: Promise.resolve({ throughMs: 1 }), stop: async () => ({ throughMs: 0 }) }) })
  const controller = new VoiceController({ speech: () => ({
    playback,
    language: voiceLanguage[language],
    onSpecial: (special) => {
      const emotion = emotionOf(special)
      if (emotion)
        emotions.push(emotion)
    },
    synthesize: async (request) => {
      requests.push(request.text)
      return new Blob([request.text])
    },
  }) })

  try {
    const response = controller.openResponse({ sessionId: 'eval', turnId: 'reply' })
    const speech = response.openSpeech({ purpose: 'answer' })
    for (let index = 0; index < markdown.length; index += writeSize)
      speech.write(markdown.slice(index, index + writeSize))
    speech.end()
    await response.finish()
  }
  finally {
    await controller.close()
  }
  return { text: requests.join(' '), emotions }
}
