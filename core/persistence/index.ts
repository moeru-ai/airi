/**
 * AIRI Core — Persistence Layer
 *
 * Barrel export for all persistence abstractions and implementations.
 */

export { InMemoryEventStore, PersistedEventStore } from "./event-store.js"
export { InMemorySnapshotStore, SnapshotManager } from "./snapshots.js"

export type {
	EventId,
	PersistedEvent,
	PersistenceAdapter,
	PersistenceTransaction,
	EventStore,
	SnapshotStore,
	RuntimeStateStore,
	RuntimeSnapshot,
	RecoveryMetadata,
	SerializedPlan,
	SerializedPlanStep,
	SerializedTask,
	SerializedCapability,
	SerializedSession,
	SerializedExecutionState,
	SerializedWorkspace,
	SerializedProposal,
	SerializedReasoningTrace,
	PersistenceOptions,
} from "./types.js"
