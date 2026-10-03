import type { ChatOrchestratorRuntimeState } from '@proj-airi/core-agent'

import type { StreamingAssistantMessage } from '../../types/chat'

import { defineStore } from 'pinia'
import { computed, ref, shallowRef, toRaw } from 'vue'

import { useChatSessionStore } from './session-store'

export const useChatStreamStore = defineStore('chat-stream', () => {
  const chatSession = useChatSessionStore()
  // Live text stays local. Context events supply remote streams without full-store replication.
  const activeTurns = shallowRef<ChatOrchestratorRuntimeState['activeTurns']>([])
  const remoteMessages = ref<Record<string, StreamingAssistantMessage>>({})
  const emptyMessage: StreamingAssistantMessage = { role: 'assistant', content: '', slices: [], tool_results: [] }
  const streamingMessage = computed({
    get: () => activeTurns.value.find(turn => turn.sessionId === chatSession.activeSessionId)?.message
      ?? remoteMessages.value[chatSession.activeSessionId] ?? emptyMessage,
    set: (message: StreamingAssistantMessage) => { remoteMessages.value[chatSession.activeSessionId] = message },
  })

  function updateActiveTurns(turns: ChatOrchestratorRuntimeState['activeTurns']) {
    activeTurns.value = turns
  }

  function beginStream(id: string) {
    streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [], createdAt: Date.now(), id }
  }

  function appendStreamLiteral(literal: string) {
    streamingMessage.value.content += literal

    const lastSlice = streamingMessage.value.slices.at(-1)
    if (lastSlice?.type === 'text') {
      lastSlice.text += literal
      return
    }

    streamingMessage.value.slices.push({
      type: 'text',
      text: literal,
    })
  }

  function finalizeStream(fullText?: string) {
    const sessionId = chatSession.activeSessionId
    if (streamingMessage.value.slices.length > 0)
      chatSession.appendSessionMessage(sessionId, toRaw(streamingMessage.value))
    streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [] }
    if (fullText)
      streamingMessage.value.content = fullText
  }

  function resetStream() {
    streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [] }
  }

  return {
    streamingMessage,
    activeTurns,
    updateActiveTurns,
    beginStream,
    appendStreamLiteral,
    finalizeStream,
    resetStream,
  }
})
