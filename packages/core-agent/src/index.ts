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
export type { ChoiceAnswer, ChoiceQuestion, Classifier, ClassifierAnswer, ClassifierQuestion, ClassifierRequest, NoulAnswer, NoulQuestion, ScoreAnswer, ScoreQuestion } from './runtime/classifier'
export { askWithin, CLASSIFIER_DEADLINE_MS, CLASSIFIER_TRUST_THRESHOLD, noulConfidence } from './runtime/classifier'
export type { CommandAdmission, CommandDestination, CommandRejection } from './runtime/command-admission'
export { admitCommand, moduleControlResource } from './runtime/command-admission'
export { CONTEXT_SOURCE_TOKEN_LIMIT, limitContextText, loadContextTokenCounter } from './runtime/context-budget'
export type { ContextTokenCounter } from './runtime/context-budget'
export type { ContextHistoryEntry, ContextIngestResult, ContextReader, ContextRegistry, ContextRegistryState } from './runtime/context-registry'
export { createContextRegistry, projectContextRegistryState } from './runtime/context-registry'
export { ERROR_BURST_COOLDOWN_MS, ERROR_BURST_LIMIT, ERROR_BURST_WINDOW_MS, ErrorBurstBreaker } from './runtime/error-burst'
export type { IntakeAppraisal, IntakeDecider, IntakeDecision, IntakeOutcome, IntakeRecord, Stimulus, StimulusOrigin } from './runtime/intake'
export { decideByPrior, deferDelayMs, IntakeLog, salienceFromUrgency } from './runtime/intake'
export type { Lease, LeaseCandidate, LeaseGrant } from './runtime/lease-table'
export { compareLeaseCandidates, LEASE_CANDIDATE_TTL_MS, LeaseTable } from './runtime/lease-table'
export { useLlmmarkerParser } from './runtime/llm-marker-parser'
export {
  isContentArrayRelatedError,
  isToolRelatedError,
  modelKey,
  streamFrom,
} from './runtime/llm-service'
export { checkRequirements, createModelProfile, estimateRequestCost, MODEL_TIER_RANK, observeLatency } from './runtime/model-profile'
export type { ModelLatency, ModelObservations, ModelProfile, ModelRequirements, ModelTier, RequestCost, RequirementsCheck } from './runtime/model-profile'
export { MIN_TASK_EVIDENCE, MIN_TASK_PASS_RATE, routeModel } from './runtime/model-routing'
export type { RoutingDecision, RoutingRejection, RoutingTask, TaskEvidence } from './runtime/model-routing'
export { applyMoodAppraisal, appraisalTarget, composeExpression, decayMood, DEFAULT_MOOD_PROFILE, describeMood, EXPRESSION_ANCHORS, MOOD_DIMENSION_VECTORS, moodAppraisalInterval, moodExpression, moodIntensity, moodQuestions } from './runtime/mood'
export type { MoodDimension, MoodExpressionName, MoodProfile, MoodState, Pad } from './runtime/mood'
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
export { SpendingLedger } from './runtime/spending'
export type { SpendingEntry, SpendingLimit, SpendingState } from './runtime/spending'
export { createStayQuietTool, STAY_QUIET_TOOL_NAME, STAY_QUIET_TOOLSET_PROMPT, stayQuietReason } from './runtime/stay-quiet'
export type { AppraiseOptions } from './runtime/triage'
export { appraiseStimulus, capSceneSalience, decideByAppraisal, SCENE_SALIENCE_CAP, triageRequest } from './runtime/triage'
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
  LlmUsage,
  StreamEvent,
  StreamFromOptions,
  StreamOptions,
} from './types/llm'
