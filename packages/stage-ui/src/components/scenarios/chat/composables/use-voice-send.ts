import type { MaybeRefOrGetter } from 'vue'

import type { PendingVoiceSend } from '../../../../stores/chat/voice-send'
import type { ChatToolReference } from '../../../../types/chat'
import type { VoiceComposerResult } from './use-voice-composer'

import { decodeBase64 } from '@moeru/std/base64'
import { computed, toValue, watch } from 'vue'

import { chatAudioRepo } from '../../../../database/repos/chat-audio.repo'
import { useChatStore } from '../../../../stores/chat'
import { useChatSessionStore } from '../../../../stores/chat/session-store'
import { useVoiceSendStore } from '../../../../stores/chat/voice-send'

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
  const drafts = useVoiceSendStore()
  const pendingSend = computed(() => drafts.pendingSends[toValue(options.sessionId)])

  async function recordingStored(pending: PendingVoiceSend) {
    const candidates = chatSession.sessionMessages[pending.sessionId]?.filter(message =>
      message.role === 'user'
      && !!message.id
      && !pending.existingMessageIds.includes(message.id)
      && Array.isArray(message.content)) ?? []
    for (const message of candidates) {
      if (!Array.isArray(message.content))
        continue
      for (const part of message.content) {
        if (part.type === 'input_audio' && await chatAudioRepo.load(part.input_audio.data) === pending.audio.data)
          return true
      }
    }
    return false
  }

  function acceptPending(pending: PendingVoiceSend) {
    const sessionId = pending.sessionId
    if (drafts.pendingSends[sessionId] !== pending)
      return
    const next = { ...drafts.pendingSends }
    delete next[sessionId]
    drafts.pendingSends = next
    if (toValue(options.sessionId) === sessionId && toValue(options.replyToMessageId) === pending.replyToMessageId)
      options.onAccepted()
  }

  async function sendPending(pending: PendingVoiceSend) {
    if (drafts.pendingSends[pending.sessionId] !== pending || pending.status === 'sending')
      return
    pending.status = 'sending'
    drafts.pendingSends = { ...drafts.pendingSends }
    try {
      await chat.send({
        sessionId: pending.sessionId,
        text: '',
        attachments: [pending.audio],
        input: {
          type: 'input:voice',
          data: { audio: new Uint8Array(decodeBase64(pending.audio.data)).buffer },
        },
        replyToMessageId: pending.replyToMessageId,
        tools: pending.tools,
      })
      if (await recordingStored(pending)) {
        acceptPending(pending)
        return
      }
      pending.status = 'failed'
      drafts.pendingSends = { ...drafts.pendingSends }
      options.onError()
    }
    catch (error) {
      if (await recordingStored(pending)) {
        acceptPending(pending)
      }
      else if (drafts.pendingSends[pending.sessionId] === pending) {
        pending.status = 'failed'
        drafts.pendingSends = { ...drafts.pendingSends }
      }
      options.onError(error)
    }
  }

  function discardPending(pending: PendingVoiceSend) {
    if (drafts.pendingSends[pending.sessionId] !== pending)
      return
    const next = { ...drafts.pendingSends }
    delete next[pending.sessionId]
    drafts.pendingSends = next
  }

  function queue(result: Extract<VoiceComposerResult, { mode: 'audio' }>, replyToMessageId?: string, tools?: ChatToolReference[]) {
    const pending: PendingVoiceSend = {
      sessionId: result.sessionId,
      audio: result.audio,
      replyToMessageId,
      tools,
      existingMessageIds: chatSession.sessionMessages[result.sessionId]?.flatMap(message => message.id ? [message.id] : []) ?? [],
      status: 'failed',
    }
    drafts.pendingSends = { ...drafts.pendingSends, [result.sessionId]: pending }
    void sendPending(pending)
  }

  watch(() => chatSession.sessionMessages[toValue(options.sessionId)], () => {
    const pending = pendingSend.value
    if (pending) {
      void recordingStored(pending).then((stored) => {
        if (stored)
          acceptPending(pending)
      }).catch(error => console.warn('[Voice Send] Failed to check stored recording:', error))
    }
  }, { immediate: true, flush: 'sync' })

  return { pendingSend, queue, sendPending, discardPending }
}
