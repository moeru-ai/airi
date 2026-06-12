/**
 * AIRI Core — Persistence Abstractions
 *
 * Storage-backend-agnostic async interfaces for durable runtime state.
 * These interfaces decouple the persistence layer from any specific storage
 * implementation (filesystem, SQLite, remote blob store).
 *
 * Design principles:
 * - All operations are async to support future remote/distributed backends.
 * - Keys are strings; values are Buffers (binary-safe) or parsed objects.
 * - Event IDs are branded strings with monotonic ordering guarantees.
 * - Snapshots are versioned and self-describing for forward-compatible recovery.
 */

import type { AiriEvent } from "../events/types.js"
import type { SessionState } from "../runtime/session.js"

// ── Branded ID ──────────────────────────────────────────────────────────

/**
 * Opaque, monotonically ordered event identifier.
 *
 * Format: `evt_{sequence}_{timestamp}` — lexicographically sortable
 * and human-readable.
 */
export type EventId = string & { readonly __brand: 'EventId' }

// ── Low-level storage ───────────────────────────────────────────────────

/**
 * Low-level storage operations.
 *
 * All values are Buffers for binary safety. Serialization/deserialization
 * is the responsibility of higher-level stores.
 */
export interface PersistenceAdapter {
	/** Read the full value for a key, or null if the key does not exist. */
	readonly read: (key: string) => Promise<Buffer | null>

	/** Write a value to a key, overwriting any existing value. */
	readonly write: (key: string, data: Buffer) => Promise<void>

	/** Append data to a key (creates the key if it does not exist). */
	readonly append: (key: string, data: Buffer) => Promise<void>

	/** Delete a key. Does not throw if the key does not exist. */
	readonly delete: (key: string) => Promise<void>

	/** List all keys that start with the given prefix. */
	readonly list: (prefix: string) => Promise<string[]>

	/** Check whether a key exists. */
	readonly exists: (key: string) => Promise<boolean>
}

/**
 * Batch operations that can be committed atomically.
 *
 * Implementations may provide true atomicity (e.g. SQLite transactions)
 * or best-effort batching (e.g. filesystem temp-file + rename).
 */
export interface PersistenceTransaction {
	/** Queue a write to the batch. */
	readonly write: (key: string, data: Buffer) => void

	/** Queue an append to the batch. */
	readonly append: (key: string, data: Buffer) => void

	/** Queue a delete to the batch. */
	readonly delete: (key: string) => void

	/** Commit all queued operations. */
	readonly commit: () => Promise<void>

	/** Discard all queued operations. */
	readonly rollback: () => Promise<void>
}

// ── Event store ─────────────────────────────────────────────────────────

/**
 * Append-only event storage with query support.
 *
 * Events are immutable once written. Ordering is guaranteed by a
 * monotonically increasing sequence number assigned at write time.
 */
export interface EventStore {
	/**
	 * Append an event to the store.
	 *
	 * Assigns a monotonic EventId and sequence number.
	 *
	 * @returns The assigned EventId.
	 */
	readonly append: (event: AiriEvent) => Promise<EventId>

	/**
	 * Get events since a given event ID (exclusive).
	 *
	 * Events are returned in sequence order (oldest first).
	 */
	readonly getSince: (eventId: EventId, limit?: number) => Promise<PersistedEvent[]>

	/**
	 * Get events associated with a session.
	 */
	readonly getBySession: (sessionId: string, limit?: number) => Promise<PersistedEvent[]>

	/**
	 * Get events associated with a module.
	 */
	readonly getByModule: (moduleId: string, limit?: number) => Promise<PersistedEvent[]>

	/**
	 * Get events of a specific type.
	 */
	readonly getByType: (eventType: string, limit?: number) => Promise<PersistedEvent[]>

	/**
	 * Get events associated with a specific execution.
	 */
	readonly getByExecution: (executionId: string) => Promise<PersistedEvent[]>

	/**
	 * Get the most recently appended event.
	 */
	readonly getLastEvent: () => Promise<PersistedEvent | null>

	/**
	 * Get the total number of events in the store.
	 */
	readonly getEventCount: () => Promise<number>
}

// ── Snapshot store ──────────────────────────────────────────────────────

/**
 * Runtime state snapshot storage.
 *
 * Snapshots are point-in-time captures of the full runtime state.
 * They are versioned and prunable.
 */
export interface SnapshotStore {
	/** Save a snapshot. */
	readonly save: (snapshot: RuntimeSnapshot) => Promise<void>

	/**
	 * Load a specific snapshot by version.
	 *
	 * @returns The snapshot, or null if not found.
	 */
	readonly load: (version: number) => Promise<RuntimeSnapshot | null>

	/**
	 * Get the latest (highest version) snapshot.
	 */
	readonly getLatest: () => Promise<RuntimeSnapshot | null>

	/**
	 * List snapshots in descending version order.
	 */
	readonly list: (limit?: number) => Promise<RuntimeSnapshot[]>

	/**
	 * Remove old snapshots, keeping only the N most recent.
	 *
	 * @returns The number of snapshots removed.
	 */
	readonly prune: (keepCount: number) => Promise<number>
}

// ── Runtime state store ─────────────────────────────────────────────────

/**
 * Key-value store for runtime state.
 *
 * Used for lightweight state that does not belong in the event store
 * or snapshots (e.g. session ownership, feature flags).
 */
export interface RuntimeStateStore {
	/** Get a value by key, or null if not found. */
	readonly get: <T>(key: string) => Promise<T | null>

	/** Set a value by key. */
	readonly set: <T>(key: string, value: T) => Promise<void>

	/** Delete a key. */
	readonly delete: (key: string) => Promise<void>

	/** Check whether a key exists. */
	readonly has: (key: string) => Promise<boolean>

	/** Remove all keys. */
	readonly clear: () => Promise<void>
}

// ── Persisted event ─────────────────────────────────────────────────────

/**
 * An event as stored in the event store.
 *
 * Adds storage metadata (eventId, sequence) to the original event.
 */
export interface PersistedEvent {
	/** The assigned event ID. */
	readonly eventId: EventId

	/** Unix timestamp (ms) when the event was stored. */
	readonly timestamp: number

	/** The event source (from AiriEventBase.source). */
	readonly source: string

	/** The event type (from the AiriEvent union discriminant). */
	readonly type: string

	/** The event payload (the full AiriEvent). */
	readonly payload: AiriEvent

	/** Monotonically increasing sequence number. */
	readonly sequence: number
}

// ── Runtime snapshot ────────────────────────────────────────────────────

/**
 * A point-in-time snapshot of the full runtime state.
 *
 * Snapshots are versioned. The version increments on each save.
 * Recovery loads the latest snapshot and replays events since.
 */
export interface RuntimeSnapshot {
	/** Snapshot version (monotonically increasing). */
	readonly version: number

	/** Unix timestamp (ms) when the snapshot was taken. */
	readonly timestamp: number

	/** The session that was active when the snapshot was taken, if any. */
	readonly sessionId?: string

	/** Serialized plan state. */
	readonly plans: SerializedPlan[]

	/** Serialized task state. */
	readonly tasks: SerializedTask[]

	/** Serialized capability state. */
	readonly capabilities: SerializedCapability[]

	/** Serialized session state. */
	readonly sessions: SerializedSession[]

	/** Optional execution state for in-flight executions. */
	readonly executionState?: SerializedExecutionState
}

// ── Recovery metadata ───────────────────────────────────────────────────

/**
 * Metadata about a recovery attempt.
 */
export interface RecoveryMetadata {
	/** The snapshot version that was loaded. */
	readonly snapshotVersion: number

	/** Number of events in the store at the time of snapshot. */
	readonly eventCountAtSnapshot: number

	/** Unix timestamp (ms) when recovery was performed. */
	readonly recoveredAt: number

	/** Executions that were running at snapshot time but not actively running at recovery. */
	readonly incompleteExecutions: string[]
}

// ── Serialized types ────────────────────────────────────────────────────

/**
 * Plain serializable version of a Plan.
 */
export interface SerializedPlan {
	/** Plan ID. */
	readonly id: string

	/** Plan name. */
	readonly name: string

	/** Optional description. */
	readonly description?: string

	/** Serialized steps. */
	readonly steps: SerializedPlanStep[]

	/** Current plan status. */
	readonly status: string

	/** Originating session ID. */
	readonly sessionId?: string

	/** ISO-8601 creation timestamp. */
	readonly createdAt: string

	/** ISO-8601 start timestamp, if started. */
	readonly startedAt?: string

	/** ISO-8601 completion timestamp, if completed. */
	readonly completedAt?: string

	/** ISO-8601 failure timestamp, if failed. */
	readonly failedAt?: string

	/** ISO-8601 cancellation timestamp, if cancelled. */
	readonly cancelledAt?: string

	/** Failure reason, if failed. */
	readonly failureReason?: string

	/** Whether this plan can be resumed after restart. */
	readonly resumable: boolean

	/** IDs of steps that were completed at snapshot time. */
	readonly completedStepIds: string[]

	/** Plan metadata. */
	readonly metadata?: Record<string, unknown>
}

/**
 * Plain serializable version of a PlanStep.
 */
export interface SerializedPlanStep {
	/** Step ID. */
	readonly id: string

	/** Step name. */
	readonly name: string

	/** Optional description. */
	readonly description?: string

	/** Step action. */
	readonly action: string

	/** Step input. */
	readonly input: Record<string, unknown>

	/** Dependency step IDs. */
	readonly dependencyIds?: string[]

	/** Step timeout in ms. */
	readonly timeoutMs?: number

	/** Current step status. */
	readonly status: string

	/** Assigned task ID, if any. */
	readonly taskId?: string

	/** Step result, if completed. */
	readonly result?: {
		readonly success: boolean
		readonly output?: unknown
		readonly error?: string
		readonly durationMs: number
	}

	/** ISO-8601 start timestamp, if started. */
	readonly startedAt?: string

	/** ISO-8601 completion timestamp, if completed. */
	readonly completedAt?: string
}

/**
 * Plain serializable version of a Task.
 */
export interface SerializedTask {
	/** Task ID. */
	readonly id: string

	/** Task title. */
	readonly title: string

	/** Optional description. */
	readonly description?: string

	/** Current task state. */
	readonly state: string

	/** Task priority. */
	readonly priority: string

	/** Owning module ID. */
	readonly moduleId: string

	/** Originating session ID, if any. */
	readonly sessionId?: string

	/** ISO-8601 creation timestamp. */
	readonly createdAt: string

	/** ISO-8601 last-update timestamp. */
	readonly updatedAt: string

	/** ISO-8601 start timestamp, if started. */
	readonly startedAt?: string

	/** ISO-8601 completion timestamp, if completed. */
	readonly completedAt?: string

	/** Task progress (0-100). */
	readonly progress: number

	/** Task metadata. */
	readonly metadata: Record<string, unknown>

	/** Cancellation state. */
	readonly cancellation: {
		readonly isCancelled: boolean
		readonly cancelledAt?: string
		readonly reason?: string
	}
}

/**
 * Plain serializable version of a CapabilityDescriptor.
 */
export interface SerializedCapability {
	/** Capability ID. */
	readonly id: string

	/** Capability name. */
	readonly name: string

	/** Description. */
	readonly description: string

	/** Owning module ID. */
	readonly moduleId: string

	/** Tools in this capability. */
	readonly tools: Array<{
		readonly id: string
		readonly name: string
		readonly description: string
	}>

	/** Registration timestamp. */
	readonly registeredAt: number
}

/**
 * Plain serializable version of a Session.
 */
export interface SerializedSession {
	/** Session ID. */
	readonly id: string

	/** Client ID. */
	readonly clientId: string

	/** Session state. */
	readonly state: SessionState

	/** ISO-8601 creation timestamp. */
	readonly createdAt: string

	/** ISO-8601 last-update timestamp. */
	readonly updatedAt: string

	/** ISO-8601 last connection timestamp, if any. */
	readonly lastConnectedAt?: string

	/** Client metadata. */
	readonly clientInfo: Record<string, unknown>

	/** Whether the session is detached (disconnected). */
	readonly isDetached: boolean

	/** Recovery token for session resumption. */
	readonly recoveryToken?: string
}

/**
 * Serialized execution state for in-flight executions.
 */
export interface SerializedExecutionState {
	/** Map of execution ID → serialized execution record. */
	readonly executions: Array<{
		readonly executionId: string
		readonly toolId: string
		readonly taskId: string
		readonly startedAt: number
		readonly status: "running" | "completed" | "failed" | "cancelled"
	}>
}

// ── Persistence options ─────────────────────────────────────────────────

/**
 * Configuration options for the persistence layer.
 */
export interface PersistenceOptions {
	/** Base filesystem path for all persisted data. */
	readonly basePath: string

	/**
	 * Interval in milliseconds for automatic snapshots.
	 * @default 60_000 (1 minute)
	 */
	readonly snapshotIntervalMs?: number

	/**
	 * Maximum number of snapshots to retain.
	 * @default 10
	 */
	readonly maxSnapshots?: number

	/**
	 * Maximum number of events to retain in the event store.
	 * When exceeded, old events are pruned.
	 * @default 100_000
	 */
	readonly maxEventLogSize?: number
}
