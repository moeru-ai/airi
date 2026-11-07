import type { TurnRef } from '@proj-airi/core-agent'

import { defineInvoke } from '@moeru/eventa'
import { clamp } from 'es-toolkit'
import { defineStore } from 'pinia'
import { computed, onScopeDispose, shallowRef } from 'vue'

import { getSpeechBusContext, voiceGetTurns, voiceInterrupt, voiceRequestTurns, voiceSnapshotChanged, voiceTurnsChanged } from '../services/speech/bus'
import { useSpeechOutputSettingsStore } from './speech-output-settings'

export type SpeechOutputStopReason = 'manual-chat' | 'manual-all'
export type SpeechOutputStopRequest = { reason: 'manual-chat', sessionId: string } | { reason: 'manual-all' }

/** Settings control future speech. External interruption targets identities supplied by the audio host. */
export const useSpeechOutputControlStore = defineStore('speech-output-control', () => {
  const settings = useSpeechOutputSettingsStore()
  const speechMuted = computed(() => !settings.enabled)
  /**
   * Playback loudness the Stage applies to its speech gain node, from 0 (silent) to 1 (full).
   * Nonzero volume changes loudness. Zero volume stops speech through the shared output setting.
   * Clamped on read because hydration and snapshots bypass commands.
   */
  const speechVolume = computed(() => clamp(settings.volume, 0, 1))
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
    settings.setEnabled(!muted)
  }

  function toggleSpeechMuted() {
    setSpeechMuted(!speechMuted.value)
  }

  function setSpeechVolume(volume: number) {
    settings.setVolume(volume)
  }

  return { speechMuted, speechVolume, activeTurns, requestStopSpeaking, setSpeechMuted, toggleSpeechMuted, setSpeechVolume }
})
