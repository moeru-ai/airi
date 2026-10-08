import { useAnalytics } from '@proj-airi/stage-ui/composables/use-analytics'
import { useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useSpeechOutputControlStore } from '@proj-airi/stage-ui/stores/speech-output-control'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

/**
 * Connects chat speech controls to the active Stage output host.
 *
 * Manual interruption stops generation and playback, then records an agent control event.
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
  const sessions = useChatSessionStore()
  const speechOutputControlStore = useSpeechOutputControlStore()
  const { speechMuted } = storeToRefs(speechOutputControlStore)
  const { trackSpeechMuteToggled, trackTtsStopClicked } = useAnalytics()

  const showStopSpeakingButton = computed(() => speechOutputControlStore.activeTurns.some(turn => turn.sessionId === sessions.activeSessionId))

  function stopSpeakingFromChat(sessionId = sessions.activeSessionId) {
    trackTtsStopClicked({ reason: 'manual-chat' })
    return speechOutputControlStore.requestStopSpeaking({ reason: 'manual-chat', sessionId })
  }

  function interruptSpeakingFromChat(sessionId = sessions.activeSessionId) {
    return speechOutputControlStore.requestStopSpeaking({ reason: 'manual-chat', sessionId })
  }

  function stopAllSpeaking() {
    trackTtsStopClicked({ reason: 'manual-all' })
    return speechOutputControlStore.requestStopSpeaking({ reason: 'manual-all' })
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
    interruptSpeakingFromChat,
    stopSpeakingFromChat,
    stopAllSpeaking,
    toggleSpeechMuted,
  }
}
