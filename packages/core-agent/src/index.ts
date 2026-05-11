export type { AgentContextPort } from './contracts/context-port'
export type { ChatHookRegistry } from './contracts/hook-types'
export type { AgentLLMPort } from './contracts/llm-port'
export type { AgentSessionPort } from './contracts/session-port'
export type { AgentForegroundStreamPort } from './contracts/stream-port'

export { createChatHooks } from './runtime/agent-hooks'
export type { ContextHistoryEntry, ContextIngestResult, ContextRegistry } from './runtime/context-registry'
export { createContextRegistry } from './runtime/context-registry'
export {
  isContentArrayRelatedError,
  isToolRelatedError,
  modelKey,
  sanitizeMessages,
  streamFrom,
  streamOptionsContentArrayCompatibilityOk,
  streamOptionsToolsCompatibilityOk,
} from './runtime/llm-service'
export { mergeLoadedSessionMessages } from './session/merge-loaded-session-messages'
export type {
  ChatAssistantMessage,
  ChatHistoryItem,
  ChatMessage,
  ChatSlices,
  ChatSlicesText,
  ChatSlicesToolCall,
  ChatSlicesToolCallResult,
  ChatStreamEvent,
  ChatStreamEventContext,
  ContextMessage,
  ErrorMessage,
  StreamingAssistantMessage,
} from './types/chat'

export type {
  BuiltinToolsResolver,
  StreamEvent,
  StreamFromOptions,
  StreamOptions,
} from './types/llm'
