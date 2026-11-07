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
 * Mute and volume are global output choices. They do not write conversation preferences.
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
    const muted = !speechMuted.value
    let speakingState: boolean | Promise<boolean>
    try {
      speakingState = options.resolveSpeakingState?.() ?? nowSpeaking.value
    }
    catch {
      // Output still changes when another window cannot provide playback telemetry.
      speechOutputControlStore.setSpeechMuted(muted)
      return
    }

    speechOutputControlStore.setSpeechMuted(muted)
    try {
      trackSpeechMuteToggled({ muted, was_speaking: await speakingState })
    }
    catch {
      // Telemetry does not delay or reverse the output choice.
    }
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
