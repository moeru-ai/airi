import { useAnalytics } from '@proj-airi/stage-ui/composables/use-analytics'
import { useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'
import { useSpeechOutputControlStore } from '@proj-airi/stage-ui/stores/speech-output-control'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

/**
 * Connects chat UI stop-speaking controls to the active stage speech output host.
 *
 * Use when:
 * - Chat input UI needs to stop assistant TTS playback without cancelling text generation.
 *
 * Expects:
 * - A Stage instance is mounted and consumes speech output stop requests.
 *
 * Returns:
 * - Visibility state for the button and a click handler for manual chat stops.
 */
export function useStopSpeakingButton() {
  const { nowSpeaking } = storeToRefs(useSpeakingStore())
  const speechOutputControlStore = useSpeechOutputControlStore()
  const { trackTtsStopClicked } = useAnalytics()

  const showStopSpeakingButton = computed(() => nowSpeaking.value)

  function stopSpeakingFromChat() {
    trackTtsStopClicked({ reason: 'manual-chat' })
    speechOutputControlStore.requestStopSpeaking('manual-chat')
  }

  return {
    showStopSpeakingButton,
    stopSpeakingFromChat,
  }
}
