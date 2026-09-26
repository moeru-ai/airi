import type { ContextUpdate, MetadataEventSource, WebSocketEventInputs } from '@proj-airi/server-shared/types'
import type { AssistantMessage, CommonContentPart, CompletionToolCall, Message, SystemMessage, ToolMessage, UserMessage } from '@xsai/shared-chat'

import type { AssistantTurn } from '../messages/types'

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
  }
  createdAt: number
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
}

/**
 * One translated fragment split from a bilingual response.
 *
 * The splitter emits these on the subtitle track only. TTS never receives
 * this text. Fragments with one pair id belong to one spoken sentence.
 */
export interface TokenTranslationPayload {
  /** ISO 639-1 code of the translation language, for example `zh`. */
  language: string
  /** Spoken-sentence pair this fragment translates. Ids increase in turn order. */
  pairId: number
  /** Raw fragment text, including surrounding whitespace from the model. */
  text: string
}

export type ChatStreamEvent
  = | { type: 'before-compose', message: string, sessionId: string, context: Omit<ChatStreamEventContext, 'composedMessage'> }
    | { type: 'after-compose', message: string, sessionId: string, context: ChatStreamEventContext }
    | { type: 'before-send', message: string, sessionId: string, context: ChatStreamEventContext }
    | { type: 'after-send', message: string, sessionId: string, context: ChatStreamEventContext }
    | { type: 'token-literal', literal: string, sessionId: string, context: ChatStreamEventContext }
    | { type: 'token-translation', translation: TokenTranslationPayload, sessionId: string, context: ChatStreamEventContext }
    | { type: 'token-special', special: string, sessionId: string, context: ChatStreamEventContext }
    | { type: 'stream-end', sessionId: string, context: ChatStreamEventContext }
    | { type: 'assistant-end', message: string, sessionId: string, context: ChatStreamEventContext }
    | { type: 'assistant-message', message: ChatAssistantMessage, sessionId: string, messageText: string, context: ChatStreamEventContext }

export type StreamingAssistantMessage = ChatAssistantMessage & { context?: ContextMessage } & { createdAt?: number, id?: string }
