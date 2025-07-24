import type { AssistantMessage, CompletionToolCall, SystemMessage, ToolMessage, ToolMessagePart, UserMessage } from '@xsai/shared-chat'

export interface ChatSlicesText {
  type: 'text'
  text: string
}

export interface ChatSlicesToolCall {
  type: 'tool-call'
  toolCall: CompletionToolCall
}

export interface ChatSlicesToolCallResult {
  type: 'tool-call-result'
  id: string
  result?: string | ToolMessagePart[]
}

export type ChatSlices = ChatSlicesText | ChatSlicesToolCall | ChatSlicesToolCallResult

export interface ChatAssistantMessage extends AssistantMessage {
  slices: ChatSlices[]
  tool_results: {
    id: string
    result?: string | ToolMessagePart[]
  }[]
}

export type ChatMessage = ChatAssistantMessage | SystemMessage | ToolMessage | UserMessage
