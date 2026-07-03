/**
 * AIRI Core — Public API
 *
 * Barrel export for all public core APIs. Import from `core/` to access
 * the event bus, runtime client, module registry, bootstrap, and logger.
 *
 * @example
 * ```ts
 * import { bootstrap, EventBus, createLogger } from '../core/index.js'
 * ```
 */

// ── Contracts (re-exported from existing files) ─────────────────────

export { bootstrap } from './bootstrap.js'

export type { CoreInstance } from './bootstrap.js'

export { CapabilityRegistry, createCapabilityId, createToolId } from './capabilities/index.js'

// ── Implementations ──────────────────────────────────────────────────

export type {
  CapabilityDescriptor,
  CapabilityId,
  CapabilityInfo,
  CapabilityStatus,
  ToolDescriptor,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolId,
} from './capabilities/index.js'
export type {
  CognitionCompleted,
  CognitionEvent,
  CognitionFailed,
  CognitionRequested,
  PlanProposed,
  PlanRejected,
  PlanValidated,
} from './cognition/events.js'

export {
  CognitionCoordinator,
  createCognitionSessionId,
  createProposal,
  createProposalId,
  createReasoningId,
  extractCapabilityRequirements,
  extractWorkspaceRequirements,
  MockCognitionProvider,
  PlanValidator,
  proposalToPlan,
  summarizeProposal,
} from './cognition/index.js'
export type {
  CognitionConstraints,
  CognitionContext,
  CognitionModel,
  CognitionPipelineResult,
  CognitionProvider,
  CognitionProviderOptions,
  CognitionRequest,
  CognitionResponse,
  CognitionSession,
  CognitionSessionId,
  EstimatedExecution,
  ExecutionSummary,
  ModelCapabilities,
  ModelInfo,
  PlanProposal,
  PlanSummary,
  ProposalId,
  ProposedStep,
  ReasoningEntry,
  ReasoningId,
  ReasoningTrace,
  TokenUsage,
  ValidationError,
  ValidationResult,
  ValidationWarning,
  WorkspaceRequirements,
} from './cognition/index.js'

export { EventBus } from './events/bus.js'
export type { UnsubscribeFn } from './events/bus.js'

export type {
  AiriEvent,
  AiriEventBase,
  DecisionRecorded,
  FailurePatternDetected,
  FailureRecorded,
  MemoryRemoved,
  MemoryRetrieved,
  MemoryStored,
  MemoryUpdated,
  ModuleActivated,
  ModuleCrashed,
  PatchApproved,
  PatchGenerated,
  PatchRejected,
  PlanCancelled,
  PlanCompleted,
  PlanFailed,
  PlanStarted,
  RepositoryIndexed,
  StepCompleted,
  StepFailed,
  StepStarted,
  TaskCancelled,
  TaskCompleted,
  TaskFailed,
  TaskProgress,
  TaskQueued,
  TaskStarted,
  ToolCalled,
  ToolExecutionCompleted,
  ToolExecutionStarted,
  ToolFinished,
  WorkspaceCorrupted,
  WorkspaceCreated,
  WorkspaceDestroyed,
  WorkspaceLeased,
  WorkspaceRecovered,
  WorkspaceReleased,
  WorktreeCreated,
  WorktreeRemoved,
} from './events/types.js'
export { createLogger, getLogLevel, setLogLevel } from './logger.js'

export type { Logger, LogLevel } from './logger.js'
export {
  createMemoryId,
  createRepositoryMapId,
  createRetrievalId,
  DecisionMemory,
  FailureMemory,
  MemoryRegistry,
  MemoryRetriever,
  RepositoryIntelligence,
} from './memory/index.js'

// ── Task orchestration ──────────────────────────────────────────────

export type {
  ArchitectureNode,
  DecisionRecord,
  FailurePattern,
  FailureRecord,
  FileGraphNode,
  GitCommitInfo,
  GitMetadata,
  ImportEdge,
  MemoryEmbedding,
  MemoryId,
  MemoryQuery,
  MemoryRecord,
  MemoryReference,
  MemoryResult,
  MemoryScope,
  MemoryType,
  RepositoryMap,
  RepositoryMapId,
  RetrievalContext,
  RetrievalId,
  RetrievalTrace,
} from './memory/index.js'

export type {
  AiriModule,
  CoreContext,
  RuntimeClient as RuntimeClientContract,
} from './modules/module.js'

// ── Worker runtime ──────────────────────────────────────────────────

export { ModuleRegistry } from './modules/registry.js'
export type {
  ActivationResult,
  ModuleActivationResult,
  ModuleRegistryOptions,
} from './modules/registry.js'

export {
  FilesystemEventStore,
  FilesystemPersistenceAdapter,
  FilesystemRuntimeStateStore,
  FilesystemSnapshotStore,
  FilesystemTransaction,
} from './persistence/adapters/filesystem/index.js'
export { InMemoryEventStore, PersistedEventStore } from './persistence/event-store.js'

export type {
  EventId,
  EventStore,
  PersistedEvent,
  PersistenceAdapter,
  PersistenceOptions,
  PersistenceTransaction,
  RecoveryMetadata,
  RuntimeSnapshot,
  RuntimeStateStore,
  SerializedCapability,
  SerializedExecutionState,
  SerializedMemoryRecord,
  SerializedPlan,
  SerializedPlanStep,
  SerializedRepositoryMap,
  SerializedRetrievalTrace,
  SerializedSession,
  SerializedTask,
  SnapshotStore,
} from './persistence/index.js'

export { InMemorySnapshotStore, SnapshotManager } from './persistence/snapshots.js'

// ── Capability runtime ────────────────────────────────────────────────

export { PlanExecutor, PlanRegistry } from './planner/index.js'
export type {
  CreatePlanInput,
  Plan,
  PlanExecutorOptions,
  PlanFilter,
  PlanId,
  PlanStatus,
  PlanStep,
  StepId,
  StepResult,
  StepStatus,
} from './planner/index.js'

export type {
  RuntimeConnectionState,
  RuntimeMessageHandler,
  RuntimeStateHandler,
} from './runtime/client.js'
export { ExecutionTrace, redactSensitive } from './runtime/execution-trace.js'
export type {
  ExecutionTraceEntry,
  ExecutionTraceFilter,
} from './runtime/execution-trace.js'
export { createLocalRuntimeClient } from './runtime/local-client.js'
export { LocalRuntimeClient } from './runtime/local-client.js'

// ── Planner layer ───────────────────────────────────────────────────

export { LocalToolRuntime } from './runtime/local-tool-runtime.js'

export type { ToolHandler } from './runtime/local-tool-runtime.js'

// ── Persistence layer ────────────────────────────────────────────────

export { RecoveryCoordinator } from './runtime/recovery.js'
export type {
  RecoveryCompleted,
  RecoveryFailed,
  RecoveryResult,
  RecoveryStarted,
  RecoveryState,
} from './runtime/recovery.js'

export type { ToolRuntime } from './runtime/tool-runtime.js'

// ── Filesystem persistence adapters ──────────────────────────────────

export { PersistentSessionManager } from './session/session-manager.js'

// ── Persistent session management ────────────────────────────────────

export { createPersistentSessionId } from './session/types.js'
export type {
  PersistentSession,
  PersistentSessionId,
  SessionFilter,
  SessionOwnership,
  SessionReconnectResult,
} from './session/types.js'

export {
  CancellationTokenSource,
  createCancellationToken,
  createLinkedCancellationToken,
  createTaskId,
  isValidTransition,
  PRIORITY_WEIGHTS,
  TaskManager,
  TaskMetrics,
  TaskReplayBuffer,
  TaskScheduler,
  VALID_TRANSITIONS,
  withTimeout,
} from './tasks/index.js'

// ── Telemetry ────────────────────────────────────────────────────────

export type {
  CancellationToken,
  CreateTaskInput,
  ModuleMetrics,
  ReplayBufferOptions,
  ReplayEvent,
  SchedulerOptions,
  Task,
  TaskCancellation,
  TaskError,
  TaskExecutionContext,
  TaskExecutor,
  TaskFilter,
  TaskId,
  TaskIsolationLevel,
  TaskManagerOptions,
  TaskMetricsSnapshot,
  TaskPriority,
  TaskResult,
  TaskState,
  TaskStatus,
  UnsubscribeFn as TaskUnsubscribeFn,
} from './tasks/index.js'

export {
  Counter,
  Gauge,
  getDefaultRegistry,
  Histogram,
  MetricRegistry,
  resetDefaultRegistry,
} from './telemetry/index.js'

// ── Runtime recovery ─────────────────────────────────────────────────

export type {
  CounterInstrument,
  GaugeInstrument,
  HistogramBucket,
  HistogramSnapshot,
} from './telemetry/index.js'

export { WorkerManager } from './workers/manager.js'

// ── Workspace isolation ────────────────────────────────────────────────

export type {
  WorkerInfo,
  WorkerManagerOptions,
  WorkerState,
} from './workers/manager.js'

export { WorkerMetrics } from './workers/metrics.js'

// ── Cognition layer ─────────────────────────────────────────────────────

export type { WorkerMetricsSnapshot } from './workers/metrics.js'

export {
  deserializeWorkerMessage,
  serializeWorkerMessage,
  WORKER_ERROR_CODES,
} from './workers/protocol.js'

export type {
  ExecuteTaskMessage,
  TaskFailureMessage,
  TaskPayload,
  TaskProgressMessage,
  TaskResultMessage,
  WorkerCapabilities,
  WorkerErrorCode,
  WorkerHeartbeatMessage,
  WorkerHelloMessage,
  WorkerMessage,
  WorkerMessageBase,
  WorkerMessageType,
  WorkerReadyMessage,
  WorkerShutdownMessage,
} from './workers/protocol.js'

// ── Semantic memory ──────────────────────────────────────────────────

export {
  createWorkspaceId,
  isValidWorkspaceTransition,
  VALID_WORKSPACE_TRANSITIONS,
  WorkspaceManager,
  WorkspaceStorage,
  WorkspaceWorktree,
} from './workspace/index.js'

export type {
  CreateWorkspaceInput,
  WorkspaceDescriptor,
  WorkspaceFilter,
  WorkspaceId,
  WorkspaceLease,
  WorkspaceManagerOptions,
  WorkspaceRecoveryState,
  WorkspaceSnapshot,
  WorkspaceState,
  WorktreeRecord,
} from './workspace/index.js'
