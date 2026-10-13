import type { TurnRef } from '@proj-airi/core-agent'

import { defineInvoke } from '@moeru/eventa'
import { useLocalStorage } from '@vueuse/core'
import { clamp } from 'es-toolkit'
import { defineStore } from 'pinia'
import { onScopeDispose, shallowRef } from 'vue'

import { getSpeechBusContext, voiceGetTurns, voiceInterrupt, voiceRequestTurns, voiceSnapshotChanged, voiceTurnsChanged } from '../services/speech/bus'

export type SpeechOutputStopReason = 'manual-chat' | 'manual-all'
export type SpeechOutputStopRequest = { reason: 'manual-chat', sessionId: string } | { reason: 'manual-all' }

/** Settings control future speech. External interruption targets identities supplied by the audio host. */
export const useSpeechOutputControlStore = defineStore('speech-output-control', () => {
  const speechMuted = useLocalStorage('settings/speech/output-muted', false)
  /**
   * Playback loudness the Stage applies to its speech gain node, from 0 (silent) to 1 (full).
   * Unlike `speechMuted`, a low volume still synthesizes speech.
   */
  const speechVolume = useLocalStorage('settings/speech/output-volume', 1)
  /**
   * Last nonzero volume. Unmuting a zeroed slider restores this value, so an
   * unmute never leaves the gain at 0 while synthesis resumes.
   */
  const lastAudibleVolume = useLocalStorage('settings/speech/output-volume-last-audible', 1)
  const activeTurns = shallowRef<readonly TurnRef[]>([])
  const lifetime = new AbortController()
  let connection = new AbortController()
  const context = getSpeechBusContext()
  const stop = context.on(voiceTurnsChanged, ({ body }) => {
    if (body)
      activeTurns.value = body
  })
  const stopConnection = context.on(voiceSnapshotChanged, ({ body }) => {
    if (!body)
      return
    if (!body.connected)
      connection.abort('Speech host disconnected')
    else if (connection.signal.aborted)
      connection = new AbortController()
  })
  context.emit(voiceRequestTurns, undefined)
  onScopeDispose(() => {
    stop()
    stopConnection()
    lifetime.abort('Speech controls disposed')
  })

  async function requestStopSpeaking(request: SpeechOutputStopRequest) {
    const signal = AbortSignal.any([lifetime.signal, connection.signal])
    const turns = await defineInvoke(context, voiceGetTurns)(undefined, { signal })
    const targets = request.reason === 'manual-all' ? turns : turns.filter(turn => turn.sessionId === request.sessionId)
    return defineInvoke(context, voiceInterrupt)({ turns: targets, cause: request.reason }, { signal })
  }

  function setSpeechMuted(muted: boolean) {
    speechMuted.value = muted
    if (!muted && speechVolume.value === 0)
      speechVolume.value = lastAudibleVolume.value
  }

  function toggleSpeechMuted() {
    setSpeechMuted(!speechMuted.value)
  }

  function setSpeechVolume(volume: number) {
    const clamped = clamp(volume, 0, 1)
    speechVolume.value = clamped
    // Zero volume and mute are the same user intent: setting 0 stops
    // synthesis, and raising the volume while muted restores the voice.
    if (clamped > 0) {
      lastAudibleVolume.value = clamped
      speechMuted.value = false
    }
    else {
      speechMuted.value = true
    }
  }

  return { speechMuted, speechVolume, activeTurns, requestStopSpeaking, setSpeechMuted, toggleSpeechMuted, setSpeechVolume }
})
