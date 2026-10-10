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

/** A local catalog ID. Renderers never treat this value as an image URL. */
export interface ChatSlicesSticker {
  type: 'sticker'
  stickerId: string
}

export type ChatSlices = ChatSlicesText | ChatSlicesToolCall | ChatSlicesToolCallResult | ChatSlicesSticker

export interface ChatAssistantMessage extends AssistantMessage {
  /** True when transport failure ended this locally preserved response before completion. */
  interrupted?: true
  /**
   * Set on a reply to a stored notice. Like the notice, it never syncs to the cloud.
   * `turnId` identifies the send. `source` names what sent the notice.
   */
  proactive?: { turnId: string, source: string }
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
  /**
   * When an assistant message stopped receiving output: at its end, or when it
   * was interrupted. `createdAt` of an assistant message is when it started.
   * Windows that do not run the generation read it, for example to time how
   * long a reply shows.
   */
  completedAt?: number
  id?: string
  /** Vision output stored by image order so later turns can reuse it without copying the image URL. */
  imageDescriptions?: Array<{
    description: string
    imageIndex: number
  }>
  /** ASR results indexed by the audio parts in the original user message. */
  audioTranscripts?: string[]
  /** Message that this message replies to in the same chat session. */
  replyToMessageId?: string
  /** Tools selected for this message. The runtime rebuilds executors from these names. */
  tools?: ChatToolReference[]
  /** Skills that the owner invoked with this message. Their steps stay with it, so later requests keep following them. */
  skills?: ChatInvokedSkill[]
  /**
   * Set on a stored notice: text for the conversation that the owner did not write, for example a finished background task.
   * Requests mark it as a notice, so the model never reads it as owner speech.
   */
  notice?: { source: string }
}

/** One skill that the owner invoked with a message, and the steps it gave the conversation. */
export interface ChatInvokedSkill {
  name: string
  instructions: string
}

export interface ChatStreamEventContext {
  /** Session ownership travels with the event across concurrent turns and renderer transports. */
  sessionId: string
  /** Stable correlation id shared by every hook emitted for one user turn. */
  turnId: string
  message: ChatHistoryItem
  contexts: Record<string, ContextMessage[]>
  composedMessage: Array<Message>
  input?: WebSocketEventInputs
  /** Server connection that receives the reply. An absent target keeps output inside the host. */
  outputTarget?: string
  /** Outputs of the send beyond the chat, which always shows it. Only a send with `voice` drives speech. */
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

export type StreamingAssistantMessage = ChatAssistantMessage & { context?: ContextMessage } & { createdAt?: number, completedAt?: number, id?: string }
