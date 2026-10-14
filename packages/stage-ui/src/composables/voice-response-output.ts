import type { ChatStreamEventContext, SpeechOutput, TurnRef } from '@proj-airi/core-agent'

import { storeToRefs } from 'pinia'
import { watch } from 'vue'

import { useChatStore } from '../stores/chat'
import { useChatSessionStore } from '../stores/chat/session-store'
import { useAiriCardStore } from '../stores/modules/airi-card'
import { useSpeechStore } from '../stores/modules/speech'
import { useSpeechOutputControlStore } from '../stores/speech-output-control'
import { useVoiceStore } from '../stores/voice'

export interface VoiceResponseOutputOptions {
  readonly audioContext: AudioContext
  readonly playback: SpeechOutput['playback']
  /**
   * Plays a special token, for example a delay or an emotion.
   * Speech calls it in order with the audio. While speech is muted, the chat stream calls it directly and waits
   * for it, so the next tokens and the response end run after it.
   */
  readonly onSpecial: (special: string, turn: TurnRef) => void | Promise<void>
  readonly onPlaybackStart?: (clip: { text: string }, turn: TurnRef) => void
  readonly onPlaybackEnd?: () => void
  /** Runs after the voice store opens the response speech of a new assistant message. */
  readonly onResponseStart?: (context: Omit<ChatStreamEventContext, 'composedMessage'>) => void | Promise<void>
}

/**
 * Connects chat replies to speech output: each assistant message opens a voice response, its tokens go to TTS, and
 * its end finishes the response. The character of the reply's session selects the speech provider and voice.
 *
 * Use when:
 * - A view hosts speech output, for example the stage scene or the voice pipeline devtool.
 *
 * Expects:
 * - At most one host at a time. `useVoiceStore().connectOutput` throws for a second host.
 *
 * Returns:
 * - A function that disconnects the output and removes the chat hooks.
 */
export function useVoiceResponseOutput(options: VoiceResponseOutputOptions) {
  const voice = useVoiceStore()
  const chatSession = useChatSessionStore()
  const cards = useAiriCardStore()
  const speechStore = useSpeechStore()
  const { speechMuted } = storeToRefs(useSpeechOutputControlStore())
  const { onBeforeMessageComposed, onTokenLiteral, onTokenSpecial, onStreamEnd, onAssistantResponseEnd } = useChatStore()

  const disconnectOutput = voice.connectOutput((turn) => {
    const output = {
      playback: options.playback,
      onSpecial: (special: string) => void options.onSpecial(special, turn),
      onPlaybackStart: (clip: { text: string }) => options.onPlaybackStart?.(clip, turn),
      onPlaybackEnd: () => options.onPlaybackEnd?.(),
    }
    if (speechMuted.value)
      return { ...output, synthesize: async () => null }
    try {
      const characterId = chatSession.sessionMetas[turn.sessionId]?.characterId
      if (!characterId)
        throw new Error('The response session has no character')
      return speechStore.createOutput(turn, cards.getModules(characterId).speech, output, options.audioContext)
    }
    catch (error) {
      // Text replies remain available when optional speech output is not configured.
      console.error('Speech output is unavailable', error)
      return { ...output, synthesize: async () => null }
    }
  })

  const stopMuteWatch = watch(speechMuted, (muted) => {
    if (muted) {
      for (const turn of voice.activeTurns)
        voice.getSpeech(turn)?.cancel('Speech muted')
    }
  })

  const finish = (context: TurnRef) => {
    void voice.finishResponse(context).catch(error => console.error('Speech response completion failed', error))
  }

  const hookCleanups = [
    onBeforeMessageComposed(async (_message, context) => {
      voice.startResponse(context)
      await options.onResponseStart?.(context)
    }),
    onTokenLiteral(async (literal, context) => {
      if (!speechMuted.value)
        await voice.getSpeech(context)?.write(literal)
    }),
    onTokenSpecial(async (special, context) => {
      if (speechMuted.value)
        await options.onSpecial(special, context)
      else
        voice.getSpeech(context)?.special(special)
    }),
    onStreamEnd(async context => finish(context)),
    onAssistantResponseEnd(async (_message, context) => finish(context)),
  ]

  return () => {
    hookCleanups.forEach(dispose => dispose())
    stopMuteWatch()
    disconnectOutput()
  }
}
