import { createEventHook } from '@vueuse/core'
import { defineStore } from 'pinia'

/**
 * Bridge so the on-stage character can speak a one-off system line aloud via the existing TTS +
 * lip-sync pipeline, WITHOUT it becoming a chat message or invoking the character's LLM.
 *
 * Use when:
 * - A module (e.g. a game adapter forwarding an in-game line) needs the character to voice a single
 *   utterance that is not part of the conversation.
 *
 * Expects:
 * - A producer calls {@link useSystemSpeechStore.speak}; the consumer (Stage.vue, which owns the TTS
 *   session) registers playback via {@link useSystemSpeechStore.onSpeak}.
 *
 * Returns:
 * - `speak(text)` to request playback, and `onSpeak(handler)` to receive requests. Decoupled through
 *   an event hook because the producer is a store and the consumer is a component. Domain policy
 *   (which lines are worth speaking) belongs to the producing module, not this neutral bridge.
 */
export const useSystemSpeechStore = defineStore('system-speech', () => {
  const speakHook = createEventHook<string>()

  /** Request that `text` be spoken aloud by the stage character. No-op if nothing is listening. */
  function speak(text: string): void {
    void speakHook.trigger(text)
  }

  return {
    speak,
    onSpeak: speakHook.on,
  }
})
