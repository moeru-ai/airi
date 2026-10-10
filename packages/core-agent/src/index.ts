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
export { checkAutomations, minutesOfDay } from './runtime/automation'
export type { Automation, AutomationCondition, AutomationTrigger, DueRecipe, InputActivity, InputSource, Weekday } from './runtime/automation'
export type {
  ChatAttachment,
  ChatOrchestratorLifecycleRecord,
  ChatOrchestratorLLMPort,
  ChatOrchestratorPromptProjection,
  ChatOrchestratorRuntime,
  ChatOrchestratorRuntimeDeps,
  ChatOrchestratorRuntimeState,
  ChatOrchestratorSendOptions,
  ChatOrchestratorSessionPort,
  QueuedSendSnapshot,
} from './runtime/chat-orchestrator-runtime'
export { createChatOrchestratorRuntime } from './runtime/chat-orchestrator-runtime'
export type { ContextHistoryEntry, ContextIngestResult, ContextRegistry } from './runtime/context-registry'
export { createContextRegistry } from './runtime/context-registry'
export { useLlmmarkerParser } from './runtime/llm-marker-parser'
export {
  isContentArrayRelatedError,
  isToolRelatedError,
  modelKey,
  streamFrom,
} from './runtime/llm-service'
export { decisionOptions, isAutoRunRecipe, isBackgroundRecipe, judgeDecision, matchKeywordRecipes, MODEL_DECIDES_STEPS, usableRecipes } from './runtime/recipe'
export type { DecisionAction, DecisionOption, DecisionQuestion, Recipe, RecipeDecision } from './runtime/recipe'
export {
  categorizeResponse,
  createStreamingCategorizer,
} from './runtime/response-categoriser'
export type {
  CategorizedResponse,
  CategorizedSegment,
  ResponseCategory,
} from './runtime/response-categoriser'
export { mergeLoadedSessionMessages } from './session/merge-loaded-session-messages'
export type {
  ChatAssistantMessage,
  ChatHistoryItem,
  ChatInvokedSkill,
  ChatMessage,
  ChatSlices,
  ChatSlicesSticker,
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
export * from './voice'
