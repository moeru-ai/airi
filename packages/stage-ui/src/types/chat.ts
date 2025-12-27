import type { ContextUpdate, WebSocketEventSource } from '@proj-airi/server-sdk'
import type { AssistantMessage, CommonContentPart, CompletionToolCall, SystemMessage, ToolMessage, UserMessage } from '@xsai/shared-chat'

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
  result?: string | CommonContentPart[]
}

export type ChatSlices = ChatSlicesText | ChatSlicesToolCall | ChatSlicesToolCallResult

export interface ChatAssistantMessage extends AssistantMessage {
  slices: ChatSlices[]
  tool_results: {
    id: string
    result?: string | CommonContentPart[]
  }[]
  categorization?: {
    speech: string
    thoughts: string
    reasoning: string
    metadata: string
  }
}

export type ChatMessage = ChatAssistantMessage | SystemMessage | ToolMessage | UserMessage

export interface ErrorMessage {
  role: 'error'
  content: string
}

export interface ContextMessage extends ContextUpdate {
  source: WebSocketEventSource | string
  createdAt: number
}

export type ChatHistoryItem = (ChatMessage | ErrorMessage) & { context?: ContextMessage } & { createdAt?: number }

export type ChatStreamEvent
  = | { type: 'before-compose', message: string, sessionId: string }
    | { type: 'after-compose', message: string, sessionId: string }
    | { type: 'before-send', message: string, sessionId: string }
    | { type: 'after-send', message: string, sessionId: string }
    | { type: 'token-literal', literal: string, sessionId: string }
    | { type: 'token-special', special: string, sessionId: string }
    | { type: 'stream-end', sessionId: string }
    | { type: 'assistant-end', message: string, sessionId: string }

export type StreamingAssistantMessage = ChatAssistantMessage & { context?: ContextMessage } & { createdAt?: number }
