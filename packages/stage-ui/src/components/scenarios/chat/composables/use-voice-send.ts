import type { MaybeRefOrGetter } from 'vue'

import type { ChatToolReference } from '../../../../types/chat'
import type { VoiceComposerResult } from './use-voice-composer'

import { decodeBase64 } from '@moeru/std/base64'
import { computed, shallowRef, toValue, watch } from 'vue'

import { useChatStore } from '../../../../stores/chat'
import { useChatSessionStore } from '../../../../stores/chat/session-store'

interface PendingVoiceSend {
  result: Extract<VoiceComposerResult, { mode: 'audio' }>
  replyToMessageId?: string
  tools?: ChatToolReference[]
  status: 'sending' | 'failed'
}

interface UseVoiceSendOptions {
  sessionId: MaybeRefOrGetter<string>
  replyToMessageId: MaybeRefOrGetter<string | undefined>
  onAccepted: () => void
  onError: (error?: unknown) => void
}

/** Keeps a recording available until chat history contains its user turn. */
export function useVoiceSend(options: UseVoiceSendOptions) {
  const chat = useChatStore()
  const chatSession = useChatSessionStore()
  const pendingSends = shallowRef<Record<string, PendingVoiceSend>>({})
  const pendingSend = computed(() => pendingSends.value[toValue(options.sessionId)])

  function recordingStored(pending: PendingVoiceSend) {
    return chatSession.sessionMessages[pending.result.sessionId]?.some(message =>
      message.role === 'user'
      && Array.isArray(message.content)
      && message.content.some(part => part.type === 'input_audio' && part.input_audio.data === pending.result.audio.data)) ?? false
  }

  function acceptPending(pending: PendingVoiceSend) {
    const sessionId = pending.result.sessionId
    if (pendingSends.value[sessionId] !== pending)
      return
    const next = { ...pendingSends.value }
    delete next[sessionId]
    pendingSends.value = next
    if (toValue(options.sessionId) === sessionId && toValue(options.replyToMessageId) === pending.replyToMessageId)
      options.onAccepted()
  }

  async function sendPending(pending: PendingVoiceSend) {
    if (pendingSends.value[pending.result.sessionId] !== pending || pending.status === 'sending')
      return
    pending.status = 'sending'
    pendingSends.value = { ...pendingSends.value }
    try {
      await chat.send({
        sessionId: pending.result.sessionId,
        text: '',
        attachments: [pending.result.audio],
        input: {
          type: 'input:voice',
          data: { audio: new Uint8Array(decodeBase64(pending.result.audio.data)).buffer },
        },
        replyToMessageId: pending.replyToMessageId,
        tools: pending.tools,
      })
      if (recordingStored(pending)) {
        acceptPending(pending)
        return
      }
      pending.status = 'failed'
      pendingSends.value = { ...pendingSends.value }
      options.onError()
    }
    catch (error) {
      if (recordingStored(pending)) {
        acceptPending(pending)
      }
      else if (pendingSends.value[pending.result.sessionId] === pending) {
        pending.status = 'failed'
        pendingSends.value = { ...pendingSends.value }
      }
      options.onError(error)
    }
  }

  function discardPending(pending: PendingVoiceSend) {
    if (pendingSends.value[pending.result.sessionId] !== pending)
      return
    const next = { ...pendingSends.value }
    delete next[pending.result.sessionId]
    pendingSends.value = next
  }

  function queue(result: PendingVoiceSend['result'], replyToMessageId?: string, tools?: ChatToolReference[]) {
    const pending: PendingVoiceSend = { result, replyToMessageId, tools, status: 'failed' }
    pendingSends.value = { ...pendingSends.value, [result.sessionId]: pending }
    void sendPending(pending)
  }

  watch(() => chatSession.sessionMessages[toValue(options.sessionId)], () => {
    const pending = pendingSend.value
    if (pending && recordingStored(pending))
      acceptPending(pending)
  }, { flush: 'sync' })

  return { pendingSend, queue, sendPending, discardPending }
}
