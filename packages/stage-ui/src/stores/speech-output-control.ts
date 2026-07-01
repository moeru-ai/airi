import { defineStore } from 'pinia'
import { ref } from 'vue'

export type SpeechOutputStopReason = 'manual-chat'

/**
 * Represents a user-requested stop-speaking command for the stage output host.
 */
export interface SpeechOutputStopRequest {
  /** Monotonic sequence number so repeated requests with the same reason still notify watchers. */
  id: number
  /** Source of the stop-speaking request. */
  reason: SpeechOutputStopReason
}

export const useSpeechOutputControlStore = defineStore('speech-output-control', () => {
  const latestStopRequest = ref<SpeechOutputStopRequest>()
  let nextRequestId = 1

  /**
   * Requests that the active speech output host stops assistant audio playback.
   *
   * Use when:
   * - A UI control should stop TTS playback without cancelling chat text generation.
   *
   * Expects:
   * - A mounted Stage host is watching {@link latestStopRequest}.
   *
   * Returns:
   * - Nothing. The latest request is published for the Stage host to consume.
   */
  function requestStopSpeaking(reason: SpeechOutputStopReason) {
    latestStopRequest.value = {
      id: nextRequestId++,
      reason,
    }
  }

  return {
    latestStopRequest,
    requestStopSpeaking,
  }
})
