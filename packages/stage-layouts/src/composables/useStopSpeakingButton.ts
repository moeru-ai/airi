import { useAnalytics } from '@proj-airi/stage-ui/composables/use-analytics'
import { useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'
import { useSpeechOutputControlStore } from '@proj-airi/stage-ui/stores/speech-output-control'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

/**
 * Connects chat speech controls to the active Stage output host.
 *
 * Manual stops affect current playback without cancelling text generation.
 * Mute is persisted by the shared store and also blocks future TTS sessions.
 */
export function useStopSpeakingButton(options: {
  /**
   * Reads speaking state from the renderer that owns playback.
   *
   * @default The current renderer's speaking store.
   */
  resolveSpeakingState?: () => boolean | Promise<boolean>
} = {}) {
  const { nowSpeaking } = storeToRefs(useSpeakingStore())
  const speechOutputControlStore = useSpeechOutputControlStore()
  const { speechMuted } = storeToRefs(speechOutputControlStore)
  const { trackSpeechMuteToggled, trackTtsStopClicked } = useAnalytics()

  const showStopSpeakingButton = computed(() => nowSpeaking.value)

  function stopSpeakingFromChat() {
    trackTtsStopClicked({ reason: 'manual-chat' })
    speechOutputControlStore.requestStopSpeaking('manual-chat')
  }

  function stopAllSpeaking() {
    trackTtsStopClicked({ reason: 'manual-all' })
    speechOutputControlStore.requestStopSpeaking('manual-all')
  }

  async function toggleSpeechMuted() {
    let wasSpeaking: boolean
    try {
      wasSpeaking = await (options.resolveSpeakingState?.() ?? nowSpeaking.value)
    }
    catch {
      // Muting is the user action; analytics must not make it fail when an
      // auxiliary renderer cannot reach the output host during a reload.
      speechOutputControlStore.setSpeechMuted(!speechMuted.value)
      return
    }

    const muted = !speechMuted.value

    speechOutputControlStore.setSpeechMuted(muted)
    trackSpeechMuteToggled({
      muted,
      was_speaking: wasSpeaking,
    })
  }

  return {
    showStopSpeakingButton,
    speechMuted,
    stopSpeakingFromChat,
    stopAllSpeaking,
    toggleSpeechMuted,
  }
}
