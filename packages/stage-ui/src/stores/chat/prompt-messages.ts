import type { Message } from '@xsai/shared-chat'

import type { ChatAssistantMessage, ChatHistoryItem, ErrorMessage } from '../../types/chat'

export type TimestampedPromptMessage = Message & { createdAt?: number }

function normalizeErrorHistoryItem(message: ErrorMessage & { createdAt?: number }): TimestampedPromptMessage {
  return {
    role: 'user',
    content: `User encountered error: ${String(message.content ?? '')}`,
    createdAt: message.createdAt,
  }
}

export function normalizeHistoryItemForPrompt(message: ChatHistoryItem): TimestampedPromptMessage {
  const { context: _context, id: _id, ...withoutUiMetadata } = message

  if (withoutUiMetadata.role === 'error')
    return normalizeErrorHistoryItem(withoutUiMetadata)

  if (withoutUiMetadata.role === 'assistant') {
    const { slices: _slices, tool_results: _toolResults, categorization: _categorization, ...assistantPromptMessage } = withoutUiMetadata as ChatAssistantMessage & { createdAt?: number }
    return assistantPromptMessage
  }

  return withoutUiMetadata
}

export function stripPromptMetadata(message: TimestampedPromptMessage): Message {
  const { createdAt: _createdAt, ...providerMessage } = message
  return providerMessage
}
