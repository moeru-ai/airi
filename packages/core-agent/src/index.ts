export type { AgentContextPort } from './contracts/context-port'
export type { ChatHookRegistry } from './contracts/hook-types'
export type { AgentLLMPort } from './contracts/llm-port'
export type { AgentSessionPort } from './contracts/session-port'
export type { AgentForegroundStreamPort } from './contracts/stream-port'
export { chatContentToInputSegments, chatMessagesToTurns, conversationToChatMessages } from './messages/chat-completions'
export {
  buildContextPromptMessage,
  formatContextPromptText,
} from './messages/context-prompt'
export type { ContextSnapshot } from './messages/context-prompt'

export { formatTimePrefix } from './messages/datetime-prefix'
export { renderConversationPreview } from './messages/preview'
export type { AssistantTurn, Citation, ContentSegment, Conversation, GenerationRound, ProviderContinuation, SystemTurn, ToolExecution, ToolInvocation, Turn, UserTurn } from './messages/types'
export { createChatHooks } from './runtime/agent-hooks'
export type { Audience } from './runtime/audience'
export {
  audienceFromBindings,
  audienceIncludes,
  intersectAudiences,
  OWNER_AUDIENCE,
  OWNER_PRIVATE_BINDING,
  OWNER_SUBJECT,
  PUBLIC_AUDIENCE,
  subjectAudience,
  unionAudiences,
} from './runtime/audience'
export type {
  ChatIngestResult,
  ChatIntakeDecision,
  ChatOrchestratorLifecycleRecord,
  ChatOrchestratorLLMPort,
  ChatOrchestratorPromptProjection,
  ChatOrchestratorRuntime,
  ChatOrchestratorRuntimeDeps,
  ChatOrchestratorRuntimeLimits,
  ChatOrchestratorRuntimeState,
  ChatOrchestratorSendOptions,
  ChatOrchestratorSessionPort,
  QueuedSendSnapshot,
} from './runtime/chat-orchestrator-runtime'
export { createChatOrchestratorRuntime, decideDirectInput } from './runtime/chat-orchestrator-runtime'
export { CONTEXT_SOURCE_TOKEN_LIMIT, limitContextText, loadContextTokenCounter } from './runtime/context-budget'
export type { ContextTokenCounter } from './runtime/context-budget'
export type { ContextHistoryEntry, ContextIngestResult, ContextReader, ContextRegistry, ContextRegistryState } from './runtime/context-registry'
export { createContextRegistry, projectContextRegistryState } from './runtime/context-registry'
export type { IntakeDecider, IntakeDecision, IntakeOutcome, IntakeRecord, Stimulus, StimulusOrigin } from './runtime/intake'
export { decideByPrior, deferDelayMs, IntakeLog, salienceFromUrgency } from './runtime/intake'
export type { Lease, LeaseGrant } from './runtime/lease-table'
export { LeaseTable } from './runtime/lease-table'
export { useLlmmarkerParser } from './runtime/llm-marker-parser'
export {
  isContentArrayRelatedError,
  isToolRelatedError,
  modelKey,
  streamFrom,
} from './runtime/llm-service'
export {
  categorizeResponse,
  createStreamingCategorizer,
} from './runtime/response-categoriser'
export type {
  CategorizedResponse,
  CategorizedSegment,
  ResponseCategory,
} from './runtime/response-categoriser'
export type { AgentRun, AgentRunState, ExecutionEnvelope } from './runtime/run-table'
export { RunTable } from './runtime/run-table'
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
  ChatToolReference,
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
