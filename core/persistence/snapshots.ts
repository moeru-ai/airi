/**
 * AIRI Core — Runtime Snapshot System
 *
 * Manages point-in-time captures of runtime state. Snapshots are versioned,
 * prunable, and designed for deterministic recovery.
 *
 * Design decisions:
 * - Lightweight: only essential state is serialized (no full execution traces).
 * - Versioned: each save increments the version number.
 * - Periodic: automatic snapshots on a configurable interval.
 * - InMemorySnapshotStore provided for testing.
 */

import type { EventBus } from "../events/bus.js"
import type {
	RuntimeSnapshot,
	SnapshotStore,
	RuntimeStateStore,
	RecoveryMetadata,
} from "./types.js"
import type {
	SerializedPlan,
	SerializedTask,
	SerializedCapability,
	SerializedSession,
	SerializedExecutionState,
	SerializedWorkspace,
	SerializedProposal,
	SerializedReasoningTrace,
	SerializedMemoryRecord,
	SerializedRetrievalTrace,
	SerializedRepositoryMap,
} from "./types.js"

// ── InMemorySnapshotStore ───────────────────────────────────────────────

/**
 * In-memory snapshot store for testing.
 */
export class InMemorySnapshotStore implements SnapshotStore {
	private readonly snapshots: RuntimeSnapshot[] = []

	save(snapshot: RuntimeSnapshot): Promise<void> {
		this.snapshots.push(snapshot)
		return Promise.resolve()
	}

	load(version: number): Promise<RuntimeSnapshot | null> {
		return Promise.resolve(this.snapshots.find((s) => s.version === version) ?? null)
	}

	getLatest(): Promise<RuntimeSnapshot | null> {
		if (this.snapshots.length === 0) return Promise.resolve(null)
		return Promise.resolve(this.snapshots[this.snapshots.length - 1] ?? null)
	}

	list(limit?: number): Promise<RuntimeSnapshot[]> {
		const sorted = [...this.snapshots].sort((a, b) => b.version - a.version)
		return Promise.resolve(limit !== undefined ? sorted.slice(0, limit) : sorted)
	}

	prune(keepCount: number): Promise<number> {
		if (this.snapshots.length <= keepCount) return Promise.resolve(0)

		// Sort by version descending, keep the most recent.
		this.snapshots.sort((a, b) => b.version - a.version)
		const toRemove = this.snapshots.length - keepCount
		this.snapshots.splice(keepCount, toRemove)
		return Promise.resolve(toRemove)
	}

	// ── Test helpers ─────────────────────────────────────────────────────

	get count(): number {
		return this.snapshots.length
	}

	clear(): void {
		this.snapshots.length = 0
	}
}

// ── SnapshotManager ─────────────────────────────────────────────────────

/**
 * Manages runtime state snapshots.
 *
 * Takes periodic snapshots of the runtime state and provides
 * recovery metadata for deterministic restoration.
 */
export class SnapshotManager {
	private readonly store: SnapshotStore
	private readonly events: EventBus
	private readonly stateStore: RuntimeStateStore | undefined

	private currentVersion = 0
	private snapshotTimer: ReturnType<typeof setInterval> | null = null
	private eventCountAtLastSnapshot = 0

	/** Function that captures current plan state. */
	private capturePlans: (() => SerializedPlan[]) = () => []

	/** Function that captures current task state. */
	private captureTasks: (() => SerializedTask[]) = () => []

	/** Function that captures current capability state. */
	private captureCapabilities: (() => SerializedCapability[]) = () => []

	/** Function that captures current session state. */
	private captureSessions: (() => SerializedSession[]) = () => []

	/** Function that captures current execution state. */
	private captureExecutionState: (() => SerializedExecutionState | undefined) = () => undefined

	/** Function that captures current workspace state. */
	private captureWorkspaces: (() => SerializedWorkspace[]) = () => []

	/** Function that captures current cognition proposals. */
	private captureProposals: (() => SerializedProposal[]) = () => []

	/** Function that captures current reasoning traces. */
	private captureReasoningTraces: (() => SerializedReasoningTrace[]) = () => []

	/** Function that captures current memory records. */
	private captureMemories: (() => SerializedMemoryRecord[]) = () => []

	/** Function that captures current retrieval traces. */
	private captureRetrievalTraces: (() => SerializedRetrievalTrace[]) = () => []

	/** Function that captures current repository maps. */
	private captureRepositoryMaps: (() => SerializedRepositoryMap[]) = () => []

	constructor(
		store: SnapshotStore,
		events: EventBus,
		stateStore?: RuntimeStateStore,
	) {
		this.store = store
		this.events = events
		this.stateStore = stateStore
	}

	// ── Configuration ────────────────────────────────────────────────────

	/**
	 * Set the plan state capture function.
	 */
	setCapturePlans(fn: () => SerializedPlan[]): void {
		this.capturePlans = fn
	}

	/**
	 * Set the task state capture function.
	 */
	setCaptureTasks(fn: () => SerializedTask[]): void {
		this.captureTasks = fn
	}

	/**
	 * Set the capability state capture function.
	 */
	setCaptureCapabilities(fn: () => SerializedCapability[]): void {
		this.captureCapabilities = fn
	}

	/**
	 * Set the session state capture function.
	 */
	setCaptureSessions(fn: () => SerializedSession[]): void {
		this.captureSessions = fn
	}

	/**
	 * Set the execution state capture function.
	 */
	setCaptureExecutionState(fn: () => SerializedExecutionState | undefined): void {
		this.captureExecutionState = fn
	}

	/**
	 * Set the workspace state capture function.
	 */
	setCaptureWorkspaces(fn: () => SerializedWorkspace[]): void {
		this.captureWorkspaces = fn
	}

	/**
	 * Set the cognition proposals capture function.
	 */
	setCaptureProposals(fn: () => SerializedProposal[]): void {
		this.captureProposals = fn
	}

	/**
	 * Set the reasoning traces capture function.
	 */
	setCaptureReasoningTraces(fn: () => SerializedReasoningTrace[]): void {
		this.captureReasoningTraces = fn
	}

	/**
	 * Set the memory records capture function.
	 */
	setCaptureMemories(fn: () => SerializedMemoryRecord[]): void {
		this.captureMemories = fn
	}

	/**
	 * Set the retrieval traces capture function.
	 */
	setCaptureRetrievalTraces(fn: () => SerializedRetrievalTrace[]): void {
		this.captureRetrievalTraces = fn
	}

	/**
	 * Set the repository maps capture function.
	 */
	setCaptureRepositoryMaps(fn: () => SerializedRepositoryMap[]): void {
		this.captureRepositoryMaps = fn
	}

	/**
	 * Set the event count provider (for recovery metadata).
	 */
	setEventCountProvider(fn: () => number): void {
		this.eventCountAtLastSnapshot = fn()
	}

	// ── Snapshot operations ──────────────────────────────────────────────

	/**
	 * Take a snapshot of the current runtime state.
	 *
	 * @returns The snapshot that was saved.
	 */
	async takeSnapshot(sessionId?: string): Promise<RuntimeSnapshot> {
		this.currentVersion++

		const snapshot: RuntimeSnapshot = {
			version: this.currentVersion,
			timestamp: Date.now(),
			sessionId,
			plans: this.capturePlans(),
			tasks: this.captureTasks(),
			capabilities: this.captureCapabilities(),
			sessions: this.captureSessions(),
			executionState: this.captureExecutionState(),
			workspaces: this.captureWorkspaces(),
			proposals: this.captureProposals(),
			reasoningTraces: this.captureReasoningTraces(),
			memories: this.captureMemories(),
			retrievalTraces: this.captureRetrievalTraces(),
			repositoryMaps: this.captureRepositoryMaps(),
		}

		await this.store.save(snapshot)

		this.events.emit("snapshot.taken", { version: snapshot.version, timestamp: snapshot.timestamp })

		// Persist recovery metadata.
		if (this.stateStore) {
			const metadata: RecoveryMetadata = {
				snapshotVersion: this.currentVersion,
				eventCountAtSnapshot: this.eventCountAtLastSnapshot,
				recoveredAt: Date.now(),
				incompleteExecutions: this.captureExecutionState()?.executions
					.filter((e) => e.status === "running")
					.map((e) => e.executionId) ?? [],
			}
			await this.stateStore.set("recovery:metadata", metadata)
		}

		return snapshot
	}

	/**
	 * Restore the latest snapshot.
	 *
	 * @returns The latest snapshot, or null if none exists.
	 */
	restoreSnapshot(): Promise<RuntimeSnapshot | null> {
		return this.store.getLatest()
	}

	/**
	 * Get recovery metadata for the latest snapshot.
	 */
	getRecoveryMetadata(): Promise<RecoveryMetadata | null> {
		if (!this.stateStore) return Promise.resolve(null)
		return this.stateStore.get<RecoveryMetadata>("recovery:metadata")
	}

	// ── Periodic snapshots ───────────────────────────────────────────────

	/**
	 * Start periodic snapshots on a timer.
	 *
	 * @param intervalMs - Interval between snapshots in milliseconds.
	 */
	periodicSnapshot(intervalMs: number): void {
		this.stopPeriodicSnapshot()

		this.snapshotTimer = setInterval(() => {
			this.takeSnapshot().catch((error) => {
				console.error(
					"[SnapshotManager] Periodic snapshot failed:",
					error instanceof Error ? error.message : String(error),
				)
			})
		}, intervalMs)
	}

	/**
	 * Stop periodic snapshots.
	 */
	stopPeriodicSnapshot(): void {
		if (this.snapshotTimer !== null) {
			clearInterval(this.snapshotTimer)
			this.snapshotTimer = null
		}
	}

	// ── Query ────────────────────────────────────────────────────────────

	/**
	 * Get the current snapshot version.
	 */
	getCurrentVersion(): number {
		return this.currentVersion
	}

	/**
	 * List available snapshots.
	 */
	listSnapshots(limit?: number): Promise<RuntimeSnapshot[]> {
		return this.store.list(limit)
	}

	/**
	 * Prune old snapshots, keeping only the N most recent.
	 */
	pruneSnapshots(keepCount: number): Promise<number> {
		return this.store.prune(keepCount)
	}
}
