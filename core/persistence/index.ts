/**
 * AIRI Core — Persistence Layer
 *
 * Barrel export for all persistence abstractions and implementations.
 */

export { InMemoryEventStore, PersistedEventStore } from './event-store.js'
export { InMemorySnapshotStore, SnapshotManager } from './snapshots.js'

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
  SerializedProposal,
  SerializedReasoningTrace,
  SerializedRepositoryMap,
  SerializedRetrievalTrace,
  SerializedSession,
  SerializedTask,
  SerializedWorkspace,
  SnapshotStore,
} from './types.js'
