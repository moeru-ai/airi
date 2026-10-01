import { defineInvokeHandler } from '@moeru/eventa'
import { encodeBase64 } from '@moeru/std/base64'
import { defineStore } from 'pinia'
import { onScopeDispose, shallowRef } from 'vue'

import { VoiceMessage } from '../libs/voice/voice-message'
import { getSpeechBusContext, voiceMessageCommand, voiceMessagesChanged, voiceRequestMessages } from '../services/speech/bus'
import { useChatStore } from './chat'
import { useSettingsAudioDevice } from './settings/audio-device'

/** The audio host retains attachment drafts. Windows only render snapshots and send explicit commands. */
export const useVoiceMessagesStore = defineStore('voice-messages', () => {
  const devices = useSettingsAudioDevice()
  const chat = useChatStore()
  const messages = new Map<string, VoiceMessage>()
  const opened = new Set<string>()
  const isRecording = shallowRef(false)
  const bus = getSpeechBusContext()

  function publish() {
    const snapshots = [...messages.values()].map(message => message.snapshot)
    isRecording.value = snapshots.some(message => message.phase === 'pending' || message.phase === 'capturing')
    bus.emit(voiceMessagesChanged, snapshots)
  }

  function record(id: string, sessionId: string) {
    if (opened.has(id))
      return false
    opened.add(id)
    const message = new VoiceMessage(id, sessionId, devices.input, async (draft) => {
      const data = encodeBase64(new Uint8Array(await draft.audio.arrayBuffer()))
      return chat.submit({
        sessionId: draft.sessionId,
        messageId: draft.messageId,
        text: '',
        attachments: [{ type: 'audio', mimeType: 'audio/wav', data }],
      })
    })
    messages.set(id, message)
    const stop = message.subscribe(() => {
      if (message.snapshot.phase === 'sent' || message.snapshot.phase === 'cancelled') {
        messages.delete(id)
        stop()
      }
      publish()
    })
    publish()
    return true
  }

  function connect() {
    const stops = [
      bus.on(voiceRequestMessages, publish),
      defineInvokeHandler(bus, voiceMessageCommand, async (command) => {
        if (command.type === 'record')
          return { status: record(command.id, command.sessionId) ? 'accepted' : 'closed' }
        const message = messages.get(command.id)
        if (!message)
          return { status: 'closed' }
        switch (command.type) {
          case 'finish':
            await message.finish()
            break
          case 'send':
            await message.send()
            break
          case 'discard': return { status: message.cancel() === 'cancelled' ? 'accepted' : 'closed' }
        }
        return { status: 'accepted' }
      }),
    ]
    publish()
    return () => {
      stops.forEach(stop => stop())
      for (const message of messages.values()) {
        if (['pending', 'capturing', 'finalizing'].includes(message.snapshot.phase))
          message.cancel()
      }
    }
  }

  onScopeDispose(() => {
    for (const message of messages.values())
      message.cancel()
  })
  return { connect, isRecording }
})
