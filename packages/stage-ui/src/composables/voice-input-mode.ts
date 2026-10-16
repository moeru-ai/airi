import { onScopeDispose, watch } from 'vue'

import { useChatSessionStore } from '../stores/chat/session-store'
import { listensContinuously, useHearingStore } from '../stores/modules/hearing'
import { useSettingsAudioDevice } from '../stores/settings/audio-device'
import { useVoiceStore } from '../stores/voice'
import { useVoiceHold } from './voice-hold'

/**
 * Runs continuous listening on the voice host while microphone input is on and the Hearing input mode listens continuously.
 *
 * Each stage page that owns the voice host calls this once. It is the one place that decides whether voice activity
 * detection runs, so a new input mode changes this function and `listensContinuously`, not each app.
 * Scope disposal stops listening.
 */
export function useVoiceListening() {
  const voice = useVoiceStore()
  const devices = useSettingsAudioDevice()
  const hearing = useHearingStore()

  watch(() => devices.enabled && listensContinuously(hearing.inputMode), (listen) => {
    if (listen)
      voice.startListening()
    else
      void voice.stopListening()
  }, { immediate: true })
  onScopeDispose(() => {
    void voice.stopListening()
  })
}

export interface VoicePushToTalkOptions {
  /** Called on a press while no Hearing provider is set up. The host explains how to set one up. */
  onUnconfigured?: () => void
}

/**
 * Begins a speech input on the voice host for each Push to Talk hold.
 *
 * Use it only in the window that owns the voice host, because it calls the voice store directly.
 * The hold is enabled while microphone input is on and the Hearing input mode is `push-to-talk`.
 * A press captures the active chat session, so the speech goes to that session even if the user switches sessions before release.
 */
export function useVoicePushToTalk(options: VoicePushToTalkOptions = {}) {
  const voice = useVoiceStore()
  const devices = useSettingsAudioDevice()
  const hearing = useHearingStore()
  const sessions = useChatSessionStore()

  return useVoiceHold({
    enabled: () => devices.enabled && hearing.inputMode === 'push-to-talk',
    sessionId: () => sessions.activeSessionId,
    begin: (sessionId) => {
      if (!hearing.configured) {
        options.onUnconfigured?.()
        return undefined
      }
      return voice.beginManual(sessionId)
    },
  })
}
