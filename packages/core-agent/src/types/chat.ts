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

export type ChatHistoryItem = (ChatMessage | ErrorMessage) & { context?: ContextMessage } & {
  createdAt?: number
  id?: string
  /**
   * Marks a user turn whose send is still in flight and may yet be retracted
   * by a stop before any output. Sync layers must not upload provisional rows
   * (see `isCloudSyncableMessage`); the orchestrator clears the marker once
   * the turn commits, and hydrate drops it from stored rows (a row loaded
   * from disk is by definition settled).
   */
  provisional?: boolean
}

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
 * Reads the `stopped` flag off a generic {@link ChatHistoryItem} (e.g. the
 * cloud-sync predicate) without casting to {@link StreamingAssistantMessage} at
 * every call site: the flag lives only on that subtype, and this predicate owns
 * the single narrowing cast.
 */
export function isStoppedAssistant(message: ChatHistoryItem): boolean {
  return message.role === 'assistant' && !!(message as StreamingAssistantMessage).stopped
}
