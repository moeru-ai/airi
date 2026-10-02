import type { ContextUpdate, MetadataEventSource, WebSocketEventInputs } from '@proj-airi/server-shared/types'
import type { AssistantMessage, CommonContentPart, CompletionToolCall, Message, SystemMessage, ToolMessage, UserMessage } from '@xsai/shared-chat'

import type { AssistantTurn } from '../messages/types'
import type { Audience } from '../runtime/audience'

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
  /** True when transport failure ended this locally preserved response before completion. */
  interrupted?: true
  /**
   * Speech that reached the listener before playback stopped. Present only for an interrupted voice reply.
   * The chat keeps the generated text. Later prompts read only this delivered part.
   */
  deliveredSpeech?: string
  /**
   * Set on a reply that a notification or idle check started without a user turn.
   * `runId` links the message to its intake and run trace. `source` names the event source.
   */
  proactive?: { runId: string, source: string }
  /** Sources returned by the provider, separate from text consumed by speech. */
  citations?: import('../messages/types').Citation[]
  search?: { id: string, status: 'in_progress' | 'searching' | 'completed' | 'failed' }
  slices: ChatSlices[]
  tool_results: {
    id: string
    isError?: boolean
    result?: string | CommonContentPart[]
  }[]
  /**
   * Exact provider messages that xsAI added for this assistant turn.
   *
   * The chat UI keeps one aggregated assistant message. Tool loops can contain
   * multiple assistant and tool messages, so this transcript preserves their
   * protocol order for the next provider request.
   */
  providerTranscript?: Message[]
  /** Portable turn history and adapter-owned continuation data. */
  generationTranscript?: AssistantTurn
  categorization?: {
    speech: string
    reasoning: string
  }
}

export type ChatMessage = ChatAssistantMessage | SystemMessage | ToolMessage | UserMessage

/** Identifies one model-facing tool without storing its runtime executor. */
export interface ChatToolReference {
  name: string
}

export interface ErrorMessage {
  role: 'error'
  content: string
}

export interface ContextMessage extends ContextUpdate<Record<string, unknown>, unknown> {
  metadata?: {
    source: MetadataEventSource
    /** Server-assigned connection that wrote this observation. Source reads route only there. */
    originConnectionId?: string
  }
  createdAt: number
  /** Local expiry can shorten the transport TTL when the host scopes an observation. */
  expiresAt?: number
  /** Host-assigned allowed audience. The host overwrites any producer value. A missing label reaches the owner only. */
  audience?: Audience
}

export type ChatHistoryItem = (ChatMessage | ErrorMessage) & {
  context?: ContextMessage
  createdAt?: number
  id?: string
  /** Vision output stored by image order so later turns can reuse it without copying the image URL. */
  imageDescriptions?: Array<{
    description: string
    imageIndex: number
  }>
  /** Message that this message replies to in the same chat session. */
  replyToMessageId?: string
  /** Tools selected for this message. The runtime rebuilds executors from these names. */
  tools?: ChatToolReference[]
}

export interface ChatStreamEventContext {
  /** Stable correlation id shared by every hook emitted for one user turn. */
  turnId: string
  message: ChatHistoryItem
  contexts: Record<string, ContextMessage[]>
  composedMessage: Array<Message>
  input?: WebSocketEventInputs
  /** Server connection that receives the reply. An absent target keeps output inside the host. */
  outputTarget?: string
  /** Session that owns the turn. The runtime always sets it, so concurrent turns stay apart. */
  sessionId?: string
  /** Run that produces the turn. */
  runId?: string
  /** Output channels of the run envelope. Only a run with `voice` drives speech. */
  outputs?: readonly string[]
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
    | { type: 'chat-turn-complete', chat: { output: StreamingAssistantMessage, outputText: string, toolCalls: ToolMessage[] }, sessionId: string, context: ChatStreamEventContext }

export type StreamingAssistantMessage = ChatAssistantMessage & { context?: ContextMessage } & { createdAt?: number, id?: string }
