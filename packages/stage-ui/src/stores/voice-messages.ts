import type { PcmBlock } from '@proj-airi/pipelines-audio'

import type { VoiceMessageCommand } from '../services/speech/bus'

import { defineInvokeHandler } from '@moeru/eventa'
import { encodeBase64 } from '@moeru/std/base64'
import { defineStore } from 'pinia'
import { onScopeDispose, shallowRef } from 'vue'

import { VoiceMessage } from '../libs/voice/voice-message'
import { getSpeechBusContext, voiceMessageCommand, voiceMessageDropped, voiceMessagesChanged, voiceRequestMessages } from '../services/speech/bus'
import { useChatStore } from './chat'
import { useHearingStore } from './modules/hearing'
import { useSettingsAudioDevice } from './settings/audio-device'

/** Resolves when encoding ends. A ready message can then be sent. A failed or discarded one cannot. */
function encoded(message: VoiceMessage) {
  const encoding = () => ['pending', 'capturing', 'finalizing'].includes(message.snapshot.phase)
  if (!encoding())
    return Promise.resolve()

  return new Promise<void>((resolve) => {
    const stop = message.subscribe(() => {
      if (encoding())
        return
      stop()
      resolve()
    })
  })
}

/** The audio host retains attachment drafts. Windows only render snapshots and send explicit commands. */
export const useVoiceMessagesStore = defineStore('voice-messages', () => {
  const devices = useSettingsAudioDevice()
  const chat = useChatStore()
  const hearing = useHearingStore()
  const messages = new Map<string, VoiceMessage>()
  const opened = new Set<string>()
  const isRecording = shallowRef(false)
  const bus = getSpeechBusContext()

  function publish() {
    const snapshots = [...messages.values()].map(message => message.snapshot)
    isRecording.value = snapshots.some(message => message.phase === 'pending' || message.phase === 'capturing')
    bus.emit(voiceMessagesChanged, snapshots)
  }

  /**
   * Transcribes a recording while it is captured, with the Hearing provider of this moment.
   * Resolves with an empty string when the transcriber completed without speech, and with nothing when it did not complete.
   */
  async function transcribeRecording(audio: ReadableStream<PcmBlock>, signal: AbortSignal) {
    let text = ''
    let completed = false
    for await (const event of hearing.createTranscriber().transcribe({ audio, signal })) {
      if (event.type === 'update')
        text = event.segments.map(segment => segment.text).join('')
      else
        completed = true
    }
    return completed ? text.trim() : (text.trim() || undefined)
  }

  function record(command: Extract<VoiceMessageCommand, { type: 'record' }>) {
    if (opened.has(command.id))
      return false
    opened.add(command.id)
    const message = new VoiceMessage(command.id, command.sessionId, devices.input, async (draft) => {
      const data = encodeBase64(new Uint8Array(await draft.audio.arrayBuffer()))
      return chat.submit({
        sessionId: draft.sessionId,
        messageId: draft.messageId,
        text: draft.text,
        attachments: [{ type: 'audio', mimeType: 'audio/wav', data, ...(draft.transcript ? { transcript: draft.transcript } : {}) }],
        audioTranscriptPending: draft.transcriptPending,
        replyToMessageId: command.replyToMessageId,
        tools: command.tools,
      })
    }, hearing.configured ? transcribeRecording : undefined, draft => chat.settleAudioTranscript(draft))
    messages.set(command.id, message)
    let submitted = false
    const stop = message.subscribe(() => {
      const { phase, error } = message.snapshot
      submitted ||= phase === 'transcribing'
      if (phase === 'sent' || phase === 'cancelled') {
        messages.delete(command.id)
        stop()
        // A message that left the chat again is gone from the list. The event lets its control report why.
        if (phase === 'cancelled' && submitted && error)
          bus.emit(voiceMessageDropped, { id: command.id, sessionId: command.sessionId, error })
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
          return { status: record(command) ? 'accepted' : 'closed' }
        const message = messages.get(command.id)
        if (!message)
          return { status: 'closed' }
        switch (command.type) {
          case 'finish':
            await message.finish()
            if (command.send) {
              await encoded(message)
              // A failed send keeps the message `ready` with its error. The snapshot reports it, and the control can retry.
              // A recording without speech is cancelled and leaves the list, so only the command result can report it.
              if (message.snapshot.phase === 'ready') {
                await message.send().catch((error: unknown) => {
                  if (message.snapshot.phase === 'cancelled')
                    throw error
                })
              }
            }
            break
          case 'send':
            await message.send(command.text)
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
