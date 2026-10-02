import type { VoiceMessageSnapshot } from '../libs/voice/voice-message'
import type { VoiceHostSnapshot, VoiceInputCommand, VoiceMessageCommand } from '../services/speech/bus'

import { defineInvoke } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { defineStore } from 'pinia'
import { onScopeDispose, shallowRef } from 'vue'

import { getSpeechBusContext, voiceInputCommand, voiceMessageCommand, voiceMessagesChanged, voiceRequestMessages, voiceRequestSnapshot, voiceSnapshotChanged } from '../services/speech/bus'

/** Windows render host snapshots and send named commands. They do not acquire audio resources. */
export const useVoiceControlsStore = defineStore('voice-controls', () => {
  const snapshot = shallowRef<VoiceHostSnapshot>({ connected: false, drafts: [] })
  const error = shallowRef<string>()
  const messages = shallowRef<readonly VoiceMessageSnapshot[]>([])
  const context = getSpeechBusContext()
  let connection = new AbortController()
  const stop = context.on(voiceSnapshotChanged, ({ body }) => {
    if (!body)
      return
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

  onScopeDispose(() => {
    stop()
    stopMessages()
    connection.abort('Voice controls disposed')
  })
  return { snapshot, messages, error, command, messageCommand }
})
