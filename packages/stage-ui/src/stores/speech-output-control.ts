import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type SpeechOutputStopReason = 'manual-chat' | 'manual-all' | 'muted'

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
  const speechMuted = useLocalStorage('settings/speech/output-muted', false, {
    window: typeof window === 'undefined' ? undefined : window,
  })
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

  /**
   * Enables or disables automatic assistant speech output.
   *
   * Enabling mute also publishes a stop request so an active Stage host can
   * cancel synthesis, streaming transport, queued audio, and current playback.
   */
  function setSpeechMuted(muted: boolean) {
    if (speechMuted.value === muted)
      return

    speechMuted.value = muted
    if (muted)
      requestStopSpeaking('muted')
  }

  function toggleSpeechMuted() {
    setSpeechMuted(!speechMuted.value)
  }

  return {
    latestStopRequest,
    speechMuted,
    requestStopSpeaking,
    setSpeechMuted,
    toggleSpeechMuted,
  }
})
