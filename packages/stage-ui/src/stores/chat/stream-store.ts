import type {} from 'pinia-plugin-synced'

import type { StreamingAssistantMessage } from '../../types/chat'

import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'

import { useChatSessionStore } from './session-store'

export const useChatStreamStore = defineStore('chat-stream', () => {
  const chatSession = useChatSessionStore()
  const streamingMessage = ref<StreamingAssistantMessage>({ content: '', createdAt: Date.now(), role: 'assistant', slices: [], tool_results: [] })

  function beginStream(id: string) {
    streamingMessage.value = { content: '', createdAt: Date.now(), id, role: 'assistant', slices: [], tool_results: [] }
  }

  function appendStreamLiteral(literal: string) {
    streamingMessage.value.content += literal

    const lastSlice = streamingMessage.value.slices.at(-1)
    if (lastSlice?.type === 'text') {
      lastSlice.text += literal
      return
    }

    streamingMessage.value.slices.push({
      text: literal,
      type: 'text',
    })
  }

  function finalizeStream(fullText?: string) {
    const sessionId = chatSession.activeSessionId
    if (streamingMessage.value.slices.length > 0)
      chatSession.appendSessionMessage(sessionId, toRaw(streamingMessage.value))
    streamingMessage.value = { content: '', role: 'assistant', slices: [], tool_results: [] }
    if (fullText)
      streamingMessage.value.content = fullText
  }

  function resetStream() {
    streamingMessage.value = { content: '', role: 'assistant', slices: [], tool_results: [] }
  }

  return {
    appendStreamLiteral,
    beginStream,
    finalizeStream,
    resetStream,
    streamingMessage,
  }
}, {
  synced: {
    state: true,
  },
})
