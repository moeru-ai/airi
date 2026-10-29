import { defineStore } from 'pinia'
import { computed, shallowRef, watch } from 'vue'

import { useHearingStore } from './modules/hearing'
import { useSettingsAudioDevice } from './settings/audio-device'
import { useVoiceStore } from './voice'

/**
 * Why a call did not start.
 *
 * - `unconfigured`: Hearing has no transcription provider. The caller explains how to set one up.
 * - `microphone-off`: the microphone switch closes the microphone for every feature. The user turns it on in Hearing.
 * - `denied`: the microphone permission was refused. The audio device store keeps the reason.
 */
export type VoiceCallStartFailure = 'unconfigured' | 'microphone-off' | 'denied'

/**
 * Owns the voice call that a chat control starts and ends.
 *
 * The voice host owns listening, muting, and sending (`callActive`, `callMuted`). This store adds what the call UI
 * needs: when the call started, and whether the user minimized it to the status capsule.
 * Use it only in the window that owns the voice host, because it calls the voice store directly.
 */
export const useVoiceCallStore = defineStore('voice-call', () => {
  const voice = useVoiceStore()
  const hearing = useHearingStore()
  const devices = useSettingsAudioDevice()

  const startedAt = shallowRef<number>()
  /** The call UI is reduced to the status capsule. The call itself continues. */
  const minimized = shallowRef(false)

  const active = computed(() => voice.callActive)
  const muted = computed(() => voice.callMuted)

  // The host can end a call by itself, for example when its scope is disposed. The UI state follows.
  watch(active, (value) => {
    if (value)
      return
    startedAt.value = undefined
    minimized.value = false
  })

  // The microphone switch closes the microphone for every feature. A call cannot listen then, so it ends.
  // The watcher is synchronous, like the one in the voice store, so the call ends before the microphone closes.
  watch(() => devices.off, (off) => {
    if (off)
      voice.endCall()
  }, { flush: 'sync' })

  /**
   * Starts a call. It must run from a user gesture, because it can ask for microphone permission.
   * Returns the failure reason, or `undefined` when the call runs. A call that already runs is kept.
   */
  async function start(): Promise<VoiceCallStartFailure | undefined> {
    if (voice.callActive)
      return undefined
    if (!hearing.configured)
      return 'unconfigured'
    if (devices.off)
      return 'microphone-off'
    if (!await devices.askPermission())
      return 'denied'
    // The permission prompt can stay open for a while. The user can turn the microphone off, or start a call from
    // another control, before it resolves, so both conditions are read again here.
    if (devices.off)
      return 'microphone-off'
    if (voice.callActive)
      return undefined

    startedAt.value = Date.now()
    minimized.value = false
    voice.startCall()
    return undefined
  }

  function hangUp() {
    voice.endCall()
  }

  function toggleMuted() {
    voice.setCallMuted(!voice.callMuted)
  }

  function minimize() {
    if (voice.callActive)
      minimized.value = true
  }

  function expand() {
    minimized.value = false
  }

  return { active, muted, minimized, startedAt, start, hangUp, toggleMuted, minimize, expand }
})
