import type { ContextUpdate, MetadataEventSource, WebSocketEventInputs } from '@proj-airi/server-shared/types'
import type { AssistantMessage, CommonContentPart, CompletionToolCall, Message, SystemMessage, ToolMessage, UserMessage } from '@xsai/shared-chat'

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
  isError?: boolean
  result?: string | CommonContentPart[]
}

export type ChatSlices = ChatSlicesText | ChatSlicesToolCall | ChatSlicesToolCallResult

export interface ChatAssistantMessage extends AssistantMessage {
  slices: ChatSlices[]
  tool_results: {
    id: string
    isError?: boolean
    result?: string | CommonContentPart[]
  }[]
  categorization?: {
    speech: string
    reasoning: string
  }
}

export type ChatMessage = ChatAssistantMessage | SystemMessage | ToolMessage | UserMessage

export interface ErrorMessage {
  role: 'error'
  content: string
}

export interface ContextMessage extends ContextUpdate<Record<string, unknown>, unknown> {
  metadata?: {
    source: MetadataEventSource
  }
  createdAt: number
}

export type ChatHistoryItem = (ChatMessage | ErrorMessage) & { context?: ContextMessage } & { createdAt?: number, id?: string }

export interface ChatStreamEventContext {
  message: ChatHistoryItem
  contexts: Record<string, ContextMessage[]>
  composedMessage: Array<Message>
  input?: WebSocketEventInputs
}

export type ChatStreamEvent
  = | { type: 'before-compose', message: string, sessionId: string, context: Omit<ChatStreamEventContext, 'composedMessage'> }
    | { type: 'after-compose', message: string, sessionId: string, context: ChatStreamEventContext }
    | { type: 'before-send', message: string, sessionId: string, context: ChatStreamEventContext }
    | { type: 'after-send', message: string, sessionId: string, context: ChatStreamEventContext }
    | { type: 'token-literal', literal: string, sessionId: string, context: ChatStreamEventContext }
    | { type: 'token-special', special: string, sessionId: string, context: ChatStreamEventContext }
    | { type: 'stream-end', sessionId: string, context: ChatStreamEventContext }
    | { type: 'assistant-end', message: string, sessionId: string, context: ChatStreamEventContext }
    | { type: 'assistant-message', message: ChatAssistantMessage, sessionId: string, messageText: string, context: ChatStreamEventContext }

export type StreamingAssistantMessage = ChatAssistantMessage & {
  context?: ContextMessage
  createdAt?: number
  id?: string
  /**
   * Marks an assistant turn that was interrupted by the user via the stop
   * button. The partial content (slices, categorization, tool_results) is
   * preserved so the user can see what was produced before the cancel; the
   * UI renders a "Stopped" badge and the message remains a valid retry
   * target. Kept off the wire shape (`ChatAssistantMessage`) so it can't
   * leak into provider requests.
   */
  stopped?: boolean
}

/**
 * Whether a history item is an assistant turn the user interrupted via Stop.
 *
 * Use when:
 * - Reading the `stopped` flag off a generic {@link ChatHistoryItem} (e.g. the
 *   cloud-sync predicate) without sprinkling `as StreamingAssistantMessage`
 *   casts at every call site.
 *
 * Expects:
 * - The flag lives only on {@link StreamingAssistantMessage} (the session/UI
 *   shape), deliberately kept off the wire-bound {@link ChatAssistantMessage}
 *   so it can't leak into provider requests; this predicate owns the single
 *   narrowing cast required to read it.
 *
 * Returns:
 * - `true` only for `role: 'assistant'` items carrying a truthy `stopped` flag.
 */
export function isStoppedAssistant(message: ChatHistoryItem): boolean {
  return message.role === 'assistant' && !!(message as StreamingAssistantMessage).stopped
}
