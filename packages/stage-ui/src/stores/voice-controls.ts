import type { VoiceMessageSnapshot } from '../libs/voice/voice-message'
import type { VoiceEnrollmentCommand, VoiceEnrollmentState, VoiceHostSnapshot, VoiceInputCommand, VoiceMessageCommand } from '../services/speech/bus'

import { defineInvoke } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { defineStore } from 'pinia'
import { computed, onScopeDispose, shallowRef } from 'vue'

import { getSpeechBusContext, voiceEnrollmentChanged, voiceEnrollmentCommand, voiceInputCommand, voiceInputLevel, voiceLevelMonitor, voiceMessageCommand, voiceMessagesChanged, voiceRequestEnrollment, voiceRequestMessages, voiceRequestSnapshot, voiceSnapshotChanged } from '../services/speech/bus'
import { useVoiceEnrollmentStore } from './voice-enrollment'

/**
 * Windows render host snapshots and send named commands. They do not acquire audio resources.
 * The one exception is a voiceprint enrollment while no voice host is connected. See `enrollment`.
 */
export const useVoiceControlsStore = defineStore('voice-controls', () => {
  const snapshot = shallowRef<VoiceHostSnapshot>({ connected: false, drafts: [] })
  const error = shallowRef<string>()
  const messages = shallowRef<readonly VoiceMessageSnapshot[]>([])
  /** The latest microphone level from the host. It keeps its last value after capture ends, so controls reset their own display. */
  const level = shallowRef(0)
  const context = getSpeechBusContext()
  let connection = new AbortController()
  const localEnrollment = useVoiceEnrollmentStore()
  /** True after `enrollmentCommand` began an enrollment in this window because no host was connected. */
  let startedLocalEnrollment = false
  const stop = context.on(voiceSnapshotChanged, ({ body }) => {
    if (!body)
      return
    // A begin command before the first host snapshot arrives starts a local enrollment.
    // When the host appears, `enrollment` shows the host state and hides that recording, so cancel it.
    // The host window also receives its own snapshots, so cancel only an enrollment that this store started.
    if (body.connected && startedLocalEnrollment) {
      startedLocalEnrollment = false
      localEnrollment.cancel()
    }
    snapshot.value = body
    error.value = body.error
    if (!body.connected)
      connection.abort('Voice host detached')
    else if (connection.signal.aborted)
      connection = new AbortController()
  })
  context.emit(voiceRequestSnapshot, undefined)
  const stopMessages = context.on(voiceMessagesChanged, ({ body }) => {
    messages.value = body ?? []
  })
  context.emit(voiceRequestMessages, undefined)
  const stopLevel = context.on(voiceInputLevel, ({ body }) => {
    if (body)
      level.value = body.level
  })
  const hostEnrollment = shallowRef<VoiceEnrollmentState>({ phase: 'idle' })
  const stopEnrollment = context.on(voiceEnrollmentChanged, ({ body }) => {
    if (body)
      hostEnrollment.value = body
  })
  context.emit(voiceRequestEnrollment, undefined)
  /**
   * The voiceprint enrollment that `enrollmentCommand` controls: the host's while a voice host is connected,
   * else this window's own. Without a host, no other code in the window listens to the microphone.
   */
  const enrollment = computed(() => snapshot.value.connected ? hostEnrollment.value : localEnrollment.state)

  async function messageCommand(command: VoiceMessageCommand) {
    if (!snapshot.value.connected)
      throw new Error('Voice host is unavailable')
    error.value = undefined
    try {
      return await defineInvoke(context, voiceMessageCommand)(command, { signal: connection.signal })
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Voice message command failed'
      throw cause
    }
  }

  async function command(command: VoiceInputCommand) {
    if (!snapshot.value.connected)
      throw new Error('Voice host is unavailable')
    error.value = undefined
    try {
      return await defineInvoke(context, voiceInputCommand)(command, { signal: connection.signal })
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Voice command failed'
      throw cause
    }
  }

  async function enrollmentCommand(command: VoiceEnrollmentCommand) {
    if (!snapshot.value.connected) {
      const accepted = command.type === 'begin' ? localEnrollment.begin() : command.type === 'finish' ? localEnrollment.finish() : localEnrollment.cancel()
      if (command.type === 'begin' && accepted)
        startedLocalEnrollment = true
      return { status: accepted ? 'accepted' as const : 'closed' as const }
    }
    error.value = undefined
    try {
      return await defineInvoke(context, voiceEnrollmentCommand)(command, { signal: connection.signal })
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Voice enrollment command failed'
      throw cause
    }
  }

  /** Asks the host to publish the level for `durationMs`. Call it again before that ends to keep the meter live. */
  function monitorLevel(durationMs: number) {
    context.emit(voiceLevelMonitor, { until: Date.now() + durationMs })
  }

  onScopeDispose(() => {
    stop()
    stopMessages()
    stopLevel()
    stopEnrollment()
    connection.abort('Voice controls disposed')
  })
  return { snapshot, messages, level, enrollment, error, command, messageCommand, enrollmentCommand, monitorLevel }
})
