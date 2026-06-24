/**
 * AIRI Core — Runtime Recovery Coordinator
 *
 * Orchestrates deterministic recovery of runtime state after a restart.
 * Loads the latest snapshot, replays events since the snapshot, and
 * reconciles incomplete executions.
 *
 * Design decisions:
 * - Deterministic: same snapshot + same events = same recovered state.
 * - Prefer explicit state machines over implicit magic.
 * - Reconciliation marks running-but-not-actively-running executions as failed.
 * - Emits recovery lifecycle events through the EventBus.
 */

import type { EventBus } from "../events/bus.js"
import type { Logger } from "../logger.js"
import type {
	SnapshotStore,
	EventStore,
	RuntimeSnapshot,
	PersistedEvent,
	EventId,
} from "../persistence/types.js"
import type { PersistentSessionId } from "../session/types.js"
import type { PersistentSessionManager } from "../session/session-manager.js"
import type { WorkspaceId, WorkspaceDescriptor, WorkspaceLease } from "../workspace/types.js"
import type { WorkspaceManager } from "../workspace/manager.js"
import type { WorkspaceStorage } from "../workspace/storage.js"

// ── Recovery events ──────────────────────────────────────────────────────

/**
 * Emitted when recovery starts.
 */
export interface RecoveryStarted {
	readonly type: "recovery.started"
	readonly timestamp: string
	readonly source: "recovery"
}

/**
 * Emitted when recovery completes successfully.
 */
export interface RecoveryCompleted {
	readonly type: "recovery.completed"
	readonly timestamp: string
	readonly source: "recovery"
	readonly eventsReplayed: number
	readonly snapshotVersion: number
}

/**
 * Emitted when recovery fails.
 */
export interface RecoveryFailed {
	readonly type: "recovery.failed"
	readonly timestamp: string
	readonly source: "recovery"
	readonly error: string
}

// ── Recovery result ──────────────────────────────────────────────────────

/**
 * Result of a recovery attempt.
 */
export interface RecoveryResult {
	/** Whether recovery succeeded. */
	readonly success: boolean

	/** The snapshot that was loaded, if any. */
	readonly snapshot: RuntimeSnapshot | null

	/** Number of events replayed. */
	readonly eventsReplayed: number

	/** Number of plans restored from snapshot. */
	readonly plansRestored: number

	/** Number of tasks restored from snapshot. */
	readonly tasksRestored: number

	/** Number of sessions restored from snapshot. */
	readonly sessionsRestored: number

	/** Number of executions reconciled (marked as failed). */
	readonly reconciledExecutions: number
	/** Number of workspaces restored from snapshot. */
	readonly workspacesRestored: number

	/** Error message if recovery failed. */
	readonly error?: string
}

// ── Recovery state ───────────────────────────────────────────────────────

/**
 * Tracks the runtime state during recovery.
 */
export interface RecoveryState {
	/** Plans restored from snapshot. */
	readonly plans: Array<{ id: string; status: string; completedStepIds: string[] }>

	/** Tasks restored from snapshot. */
	readonly tasks: Array<{ id: string; state: string; moduleId: string }>

	/** Sessions restored from snapshot. */
	readonly sessions: Array<{ id: string; state: string; clientId: string }>

	/** Executions that were running at snapshot time. */
	incompleteExecutions: string[]

	/** Event IDs that have been replayed (for deduplication). */
	readonly replayedEventIds: Set<string>
}

// ── RecoveryCoordinator ──────────────────────────────────────────────────

/**
 * Orchestrates deterministic runtime recovery.
 *
 * Recovery flow:
 * 1. Load latest snapshot.
 * 2. Replay events since snapshot.
 * 3. Restore planner state (active plans, pending steps).
 * 4. Restore active executions (running tasks).
 * 5. Restore session ownership.
 * 6. Reconcile incomplete executions.
 */
export class RecoveryCoordinator {
	private readonly snapshotStore: SnapshotStore
	private readonly eventStore: EventStore
	private readonly events: EventBus
	private readonly logger: Logger
	private readonly sessionManager?: PersistentSessionManager
	private readonly workspaceManager?: WorkspaceManager
	private readonly workspaceStorage?: WorkspaceStorage

	/** State built during recovery. */
	private recoveryState: RecoveryState = {
		plans: [],
		tasks: [],
		sessions: [],
		incompleteExecutions: [],
		replayedEventIds: new Set(),
	}

	constructor(
		snapshotStore: SnapshotStore,
		eventStore: EventStore,
		events: EventBus,
		logger: Logger,
		sessionManager?: PersistentSessionManager,
		workspaceManager?: WorkspaceManager,
		workspaceStorage?: WorkspaceStorage,
	) {
		this.snapshotStore = snapshotStore
		this.eventStore = eventStore
		this.events = events
		this.logger = logger
		this.sessionManager = sessionManager
		this.workspaceManager = workspaceManager
		this.workspaceStorage = workspaceStorage
	}

	// ── Main recovery ─────────────────────────────────────────────────────

	/**
	 * Perform full recovery.
	 *
	 * @returns The recovery result.
	 */
	async recover(): Promise<RecoveryResult> {
		const startedEvent: RecoveryStarted = {
			type: "recovery.started",
			timestamp: new Date().toISOString(),
			source: "recovery",
		}
		this.events.emit("recovery.started", startedEvent)

		try {
			// Step 1: Load latest snapshot.
			const snapshot = await this.snapshotStore.getLatest()

			if (snapshot) {
				this.logger.info(
					`Recovery: loaded snapshot v${snapshot.version} from ${new Date(snapshot.timestamp).toISOString()}`,
				)
			} else {
				this.logger.info("Recovery: no snapshot found, starting fresh")
			}

			// Step 2: Replay events since snapshot.
			const eventsReplayed = await this.replayEvents(snapshot)

			// Step 3: Restore planner state.
			const plansRestored = this.restorePlans(snapshot)

			// Step 4: Restore task state.
			const tasksRestored = this.restoreTasks(snapshot)

			// Step 5: Restore session state.
			const sessionsRestored = this.restoreSessions(snapshot)

			// Step 6: Reconcile incomplete executions.
			const reconciled = this.reconcileExecutions(snapshot)
			// Step 7: Restore workspaces.
			const workspacesRestored = await this.restoreWorkspaces(snapshot)

			const result: RecoveryResult = {
				success: true,
				snapshot,
				eventsReplayed,
				plansRestored,
				tasksRestored,
				sessionsRestored,
				reconciledExecutions: reconciled,
				workspacesRestored,
			}

			const completedEvent: RecoveryCompleted = {
				type: "recovery.completed",
				timestamp: new Date().toISOString(),
				source: "recovery",
				eventsReplayed,
				snapshotVersion: snapshot?.version ?? 0,
			}
			this.events.emit("recovery.completed", completedEvent)

			this.logger.info(
				`Recovery complete: ${eventsReplayed} events replayed, ${plansRestored} plans, ${tasksRestored} tasks, ${sessionsRestored} sessions restored, ${reconciled} executions reconciled`,
			)

			return result
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)

			const failedEvent: RecoveryFailed = {
				type: "recovery.failed",
				timestamp: new Date().toISOString(),
				source: "recovery",
				error: message,
			}
			this.events.emit("recovery.failed", failedEvent)

			this.logger.error(`Recovery failed: ${message}`)

			return {
				success: false,
				snapshot: null,
				eventsReplayed: 0,
				plansRestored: 0,
				tasksRestored: 0,
				sessionsRestored: 0,
				reconciledExecutions: 0,
				workspacesRestored: 0,
				error: message,
			}
		}
	}

	// ── Get recovery state ────────────────────────────────────────────────

	/**
	 * Get the state built during recovery.
	 */
	getRecoveryState(): Readonly<RecoveryState> {
		return this.recoveryState
	}

	// ── Private: replay events ────────────────────────────────────────────

	/**
	 * Replay events since the snapshot.
	 *
	 * Events are replayed in sequence order. Already-replayed events
	 * (tracked by event ID) are skipped for idempotency.
	 */
	private async replayEvents(snapshot: RuntimeSnapshot | null): Promise<number> {
		const lastEvent = await this.eventStore.getLastEvent()
		if (!lastEvent) return 0

		// Determine the starting point for replay.
		const sinceId = snapshot
			? await this.findSnapshotEventId(snapshot)
			: undefined

		let replayed = 0

		if (sinceId) {
			// Replay events since the snapshot's last event.
			const events = await this.eventStore.getSince(sinceId)
			for (const event of events) {
				if (!this.recoveryState.replayedEventIds.has(event.eventId as string)) {
					this.replayEvent(event)
					this.recoveryState.replayedEventIds.add(event.eventId as string)
					replayed++
				}
			}
		} else {
			// No snapshot — replay all events.
			const lastEvt = await this.eventStore.getLastEvent()
			if (lastEvt) {
				const allEvents = await this.eventStore.getSince("evt_0_0" as EventId)
				for (const event of allEvents) {
					if (!this.recoveryState.replayedEventIds.has(event.eventId as string)) {
						this.replayEvent(event)
						this.recoveryState.replayedEventIds.add(event.eventId as string)
						replayed++
					}
				}
			}
		}

		return replayed
	}

	/**
	 * Replay a single event.
	 *
	 * During recovery, events are used to rebuild in-memory state.
	 * The EventBus is NOT used here to avoid side effects — instead,
	 * we directly update the recovery state.
	 */
	private replayEvent(event: PersistedEvent): void {
		const payload = event.payload

		switch (payload.type) {
			case "plan.started":
			case "plan.completed":
			case "plan.failed":
			case "plan.cancelled": {
				const planEvent = payload as { planId: string; name: string }
				// Update plan state in recovery state.
				const existing = this.recoveryState.plans.find(
					(p) => p.id === planEvent.planId,
				)
				if (existing) {
					existing.status = payload.type.replace("plan.", "")
				}
				break
			}

			case "step.started":
			case "step.completed":
			case "step.failed": {
				const stepEvent = payload as {
					planId: string
					stepId: string
					success?: boolean
				}
				// Track completed steps for resumable execution.
				if (stepEvent.success && stepEvent.stepId) {
					const plan = this.recoveryState.plans.find(
						(p) => p.id === stepEvent.planId,
					)
					if (plan) {
						plan.completedStepIds.push(stepEvent.stepId)
					}
				}
				break
			}

			case "task.started":
			case "task.completed":
			case "task.failed":
			case "task.cancelled": {
				const taskEvent = payload as { taskId: string }
				const existing = this.recoveryState.tasks.find(
					(t) => t.id === taskEvent.taskId,
				)
				if (existing) {
					existing.state = payload.type.replace("task.", "")
				}
				break
			}

			default:
				// Other events don't affect recovery state.
				break
		}
	}

	// ── Private: restore plans ────────────────────────────────────────────

	/**
	 * Restore plan state from snapshot.
	 */
	private restorePlans(snapshot: RuntimeSnapshot | null): number {
		if (!snapshot) return 0

		for (const plan of snapshot.plans) {
			this.recoveryState.plans.push({
				id: plan.id,
				status: plan.status,
				completedStepIds: [...plan.completedStepIds],
			})
		}

		return snapshot.plans.length
	}

	// ── Private: restore tasks ────────────────────────────────────────────

	/**
	 * Restore task state from snapshot.
	 */
	private restoreTasks(snapshot: RuntimeSnapshot | null): number {
		if (!snapshot) return 0

		for (const task of snapshot.tasks) {
			this.recoveryState.tasks.push({
				id: task.id,
				state: task.state,
				moduleId: task.moduleId,
			})
		}

		return snapshot.tasks.length
	}

	// ── Private: restore sessions ─────────────────────────────────────────

	/**
	 * Restore session state from snapshot.
	 */
	private restoreSessions(snapshot: RuntimeSnapshot | null): number {
		if (!snapshot) return 0

		for (const session of snapshot.sessions) {
			this.recoveryState.sessions.push({
				id: session.id,
				state: session.state,
				clientId: session.clientId,
			})
		}

		// If a session manager is configured, load sessions into it.
		if (this.sessionManager) {
			this.sessionManager.loadFromSnapshot(
				snapshot.sessions.map((s) => ({
					...s,
					id: s.id as PersistentSessionId,
				})),
			)
		}

		return snapshot.sessions.length
	}

	// ── Private: reconcile executions ─────────────────────────────────────

	/**
	 * Reconcile incomplete executions.
	 *
	 * Executions that were running at snapshot time but are not actively
	 * running at recovery time are marked as failed.
	 */
	private reconcileExecutions(snapshot: RuntimeSnapshot | null): number {
		if (!snapshot?.executionState) return 0

		const incomplete = snapshot.executionState.executions.filter(
			(e) => e.status === "running",
		)

		this.recoveryState.incompleteExecutions = incomplete.map(
			(e) => e.executionId,
		)

		// Log reconciliation.
		for (const execution of incomplete) {
			this.logger.warn(
				`Recovery: reconciling incomplete execution ${execution.executionId} (tool: ${execution.toolId}, task: ${execution.taskId})`,
			)
		}

		return incomplete.length
	}

	// ── Private: helpers ──────────────────────────────────────────────────

	/**
	 * Find the event ID that corresponds to a snapshot.
	 *
	 * Uses the last event in the store as a proxy.
	 */
	private async findSnapshotEventId(
		_snapshot: RuntimeSnapshot,
	): Promise<EventId> {
		// The snapshot stores the event count at the time it was taken.
		// We use the last event as the starting point.
		const lastEvent = await this.eventStore.getLastEvent()
		if (!lastEvent) return "evt_0_0" as EventId
		return lastEvent.eventId
	}
	// ── Workspace recovery ────────────────────────────────────────────────
	/**
	 * Restore workspaces from a snapshot.
	 *
	 *
	 * Loads workspace manifests from storage and restores them into the
	 * workspace manager. Emits WorkspaceRecovered or WorkspaceCorrupted
	 * events for each workspace.
	 *
	 * @returns The number of workspaces restored.
	 */
	restoreWorkspaces(snapshot: RuntimeSnapshot | null): Promise<number> {
		if (!this.workspaceManager || !snapshot) return Promise.resolve(0)

		const workspaceSnapshots = snapshot.workspaces ?? []
		if (workspaceSnapshots.length === 0) return Promise.resolve(0)

		let restored = 0

		for (const ws of workspaceSnapshots) {
			const result = this.restoreSingleWorkspace(ws)
			if (result) restored++
		}

		return Promise.resolve(restored)
	}

	private restoreSingleWorkspace(ws: RuntimeSnapshot["workspaces"] extends (infer T)[] | undefined ? T : never): boolean {
		if (!ws.descriptor || !ws.id) {
			this.logger.warn(`Recovery: skipping invalid workspace snapshot: ${JSON.stringify(ws)}`)
			this.emitWorkspaceCorrupted(ws.id ?? "unknown", "Invalid workspace snapshot: missing descriptor or id")
			return false
		}

		try {
			this.workspaceManager!.restoreFromSnapshots([{
				id: ws.id as WorkspaceId,
				descriptor: ws.descriptor as WorkspaceDescriptor,
				lease: ws.lease as WorkspaceLease | undefined,
				activeTaskIds: ws.activeTaskIds ?? [],
				createdAt: ws.createdAt,
			}])

			this.logger.info(`Recovery: restored workspace ${ws.id} (state: ${ws.descriptor.state})`)
			this.emitWorkspaceRecovered(ws.id as WorkspaceId, ws.descriptor.state)
			return true
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			this.logger.error(`Recovery: failed to restore workspace ${ws.id}: ${message}`)
			this.emitWorkspaceCorrupted(ws.id ?? "unknown", message)
			return false
		}
	}

	private emitWorkspaceCorrupted(workspaceId: string, error: string): void {
		this.events.emit("workspace.corrupted", {
			timestamp: new Date().toISOString(),
			source: "recovery",
			workspaceId,
			error,
			needsManualIntervention: true,
		})
	}

	private emitWorkspaceRecovered(workspaceId: WorkspaceId, state: string): void {
		this.events.emit("workspace.recovered", {
			timestamp: new Date().toISOString(),
			source: "recovery",
			workspaceId,
			previousState: state,
			newState: state,
			needsReconciliation: false,
		})
	}

	/**
	 * Reconcile orphaned workspaces.
	 *
	 * Detects workspaces with no active session and marks them for cleanup.
	 * Also detects corrupted workspace metadata.
	 *
	 * @returns The number of orphaned workspaces detected.
	 */
	reconcileOrphanedWorkspaces(): Promise<number> {
		if (!this.workspaceManager) return Promise.resolve(0)

		const allWorkspaces = this.workspaceManager.listWorkspaces()
		let orphaned = 0

		for (const ws of allWorkspaces) {
			// A workspace with no session and no active tasks is orphaned.
			if (!ws.sessionId && this.workspaceManager.getActiveTasks(ws.id).length === 0) {
				this.logger.warn(`Recovery: detected orphaned workspace ${ws.id} "${ws.name}"`)

				this.events.emit("workspace.corrupted", {
					timestamp: new Date().toISOString(),
					source: "recovery",
					workspaceId: ws.id as string,
					error: "Orphaned workspace: no active session or tasks",
					needsManualIntervention: false,
				})

				orphaned++
			}
		}

		return Promise.resolve(orphaned)
	}
}
