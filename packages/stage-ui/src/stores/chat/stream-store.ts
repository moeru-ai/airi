import type { StreamingAssistantMessage } from '../../types/chat'

import { defineStore } from 'pinia'
import { ref } from 'vue'

import { useChatSessionStore } from './session-store'

export const useChatStreamStore = defineStore('chat-stream', () => {
  const chatSession = useChatSessionStore()
  const streamingMessage = ref<StreamingAssistantMessage>({ role: 'assistant', content: '', slices: [], tool_results: [], createdAt: Date.now() })

  function beginStream() {
    streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [], createdAt: Date.now() }
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
    const sessionMessagesForSend = chatSession.getSessionMessages(sessionId)
    if (streamingMessage.value.slices.length > 0)
      sessionMessagesForSend.push(streamingMessage.value)
    streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [] }
    if (fullText)
      streamingMessage.value.content = fullText
  }

  function resetStream() {
    streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [] }
  }

  return {
    streamingMessage,
    beginStream,
    appendStreamLiteral,
    finalizeStream,
    resetStream,
  }
})
