import { useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'

import { useSpeechOutputControlStore } from '@proj-airi/stage-ui/stores/speech-output-control'
import { computed } from 'vue'

/**
 * Composable that provides stop-speaking button state and action for chat surfaces.
 *
 * Use when:
 * - Rendering a chat UI that needs a stop-speaking button during TTS playback.
 *
 * Returns:
 * - `showStopSpeakingButton`: computed ref that is true while the character is speaking.
 * - `stopSpeakingFromChat`: function that requests the speech pipeline to stop.
 */
export function useStopSpeakingButton() {
  const speakingStore = useSpeakingStore()
  const speechOutputControlStore = useSpeechOutputControlStore()

  const showStopSpeakingButton = computed(() => speakingStore.nowSpeaking)

  function stopSpeakingFromChat() {
    speechOutputControlStore.requestStop('manual-chat')
  }

  return { showStopSpeakingButton, stopSpeakingFromChat }
}
