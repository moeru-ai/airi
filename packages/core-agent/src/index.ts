export type { AgentContextPort } from './contracts/context-port'
export type {
  CustomModelRuntimeProtocol,
  FetchTransportMethod,
  FetchTransportOperation,
  FetchTransportPort,
  FetchTransportRequest,
  FetchTransportResponse,
} from './contracts/fetch-transport-port'
export { CUSTOM_MODEL_RUNTIME_PROTOCOLS } from './contracts/fetch-transport-port'
export type { ChatHookRegistry } from './contracts/hook-types'
export type { AgentLLMPort } from './contracts/llm-port'
export type {
  DiscoveredModel,
  ModelConnectionErrorFields,
  ModelDiscoveryResult,
  ModelDiscoveryStatus,
  ModelGenerationValidationResult,
  ModelRuntimeConnection,
  ModelRuntimePort,
  ModelRuntimeStreamInput,
  ModelRuntimeValidationInput,
} from './contracts/model-runtime-port'
export type { AgentSessionPort } from './contracts/session-port'
export type { AgentForegroundStreamPort } from './contracts/stream-port'

export {
  buildContextPromptMessage,
  formatContextPromptText,
} from './messages/context-prompt'
export type { ContextSnapshot } from './messages/context-prompt'
export { formatTimePrefix } from './messages/datetime-prefix'
export { createChatHooks } from './runtime/agent-hooks'
export type {
  ChatOrchestratorLifecycleRecord,
  ChatOrchestratorLLMPort,
  ChatOrchestratorModelRuntime,
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
  sanitizeMessages,
  streamFrom,
  streamOptionsContentArrayCompatibilityOk,
  streamOptionsToolsCompatibilityOk,
} from './runtime/llm-service'
export {
  BROWSER_REQUEST_BLOCKED_CAUSES,
  classifyNetworkFailure,
  createBrowserRequestBlockedDiagnostics,
  createChatProviderRuntime,
  createCustomModelRuntime,
  createDirectFetchTransport,
  createModelDiscoverySession,
  createTransportFetch,
  discoverModelsWithTransport,
  FETCH_TRANSPORT_MAX_BODY_BYTES,
  isModelConnectionError,
  listBrowserRequestBlockedCauses,
  modelConnectionCodeFromStatus,
  ModelConnectionError,
  modelConnectionErrorFromStatus,
  modelRuntimeKey,
  parseDiscoveredModels,
  parseFetchTransportRequest,
  redactSecretText,
  secretValuesFromHeaders,
  streamOptionsContentArrayOkByKey,
  streamOptionsToolsOkByKey,
  toAiriStreamEvent,
  toModelConnectionError,
} from './runtime/model-runtime'
export type {
  BrowserRequestBlockedCause,
  BrowserRequestBlockedDiagnostics,
} from './runtime/model-runtime'
export type {
  ModelDiscoverySession,
  ModelDiscoverySessionState,
} from './runtime/model-runtime'
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
