/**
 * AIRI Core — Workspace Model
 *
 * Branded types, descriptors, and lifecycle states for the workspace
 * isolation layer. Workspaces provide filesystem-level execution
 * containment for task execution, with optional git worktree isolation.
 *
 * Design principles:
 * - Branded WorkspaceId prevents accidental string confusion.
 * - WorkspaceState is a strict lifecycle — transitions are validated.
 * - WorkspaceLease prevents conflicting concurrent access.
 * - WorkspaceSnapshot enables deterministic recovery after restart.
 */

// ── Branded ID ──────────────────────────────────────────────────────────

/**
 * Opaque workspace identifier.
 *
 * Created via createWorkspaceId() to ensure brand safety at creation sites.
 */
export type WorkspaceId = string & { readonly __brand: 'WorkspaceId' }

/**
 * Create a branded WorkspaceId from a raw string.
 *
 * @example
 * ```ts
 * const id = createWorkspaceId("ws-abc123")
 * ```
 */
export function createWorkspaceId(raw: string): WorkspaceId {
	return raw as WorkspaceId
}

// ── Workspace lifecycle states ────────────────────────────────────────────

/**
 * Workspace lifecycle states.
 *
 * State transitions follow a deterministic flow:
 * creating → active → leased → executing → suspended → active
 * creating → active → destroying → destroyed
 * Any state → corrupted (on error)
 */
export type WorkspaceState =
	| "creating"
	| "active"
	| "leased"
	| "executing"
	| "suspended"
	| "destroying"
	| "destroyed"
	| "corrupted"

/**
 * Valid workspace state transitions.
 *
 * Each entry maps a current state to the set of states it can transition to.
 */
export const VALID_WORKSPACE_TRANSITIONS: Record<WorkspaceState, readonly WorkspaceState[]> = {
	creating: ["active", "corrupted"],
	active: ["leased", "destroying", "corrupted"],
	leased: ["executing", "active", "destroying", "corrupted"],
	executing: ["suspended", "active", "corrupted"],
	suspended: ["active", "destroying", "corrupted"],
	destroying: ["destroyed", "corrupted"],
	destroyed: [],
	corrupted: [],
}

/**
 * Check whether a workspace state transition is valid.
 */
export function isValidWorkspaceTransition(
	from: WorkspaceState,
	to: WorkspaceState,
): boolean {
	return VALID_WORKSPACE_TRANSITIONS[from]?.includes(to) ?? false
}

// ── Workspace descriptor ─────────────────────────────────────────────────

/**
 * Workspace descriptor — the full metadata for a workspace.
 */
export interface WorkspaceDescriptor {
	/** Unique workspace identifier. */
	readonly id: WorkspaceId

	/** Human-readable workspace name. */
	readonly name: string

	/** Optional description. */
	readonly description?: string

	/** Absolute path to the workspace root directory. */
	readonly rootPath: string

	/** Current lifecycle state. */
	readonly state: WorkspaceState

	/** Associated session ID, if any. */
	readonly sessionId?: string

	/** Associated repository ID, if any. */
	readonly repositoryId?: string

	/** Git branch name, if using worktree isolation. */
	readonly branchName?: string

	/** ISO-8601 creation timestamp. */
	readonly createdAt: string

	/** ISO-8601 last-update timestamp. */
	readonly updatedAt: string

	/** Path to git worktree, if applicable. */
	readonly worktreePath?: string

	/** Arbitrary metadata. */
	readonly metadata: Record<string, unknown>
}

// ── Workspace lease ──────────────────────────────────────────────────────

/**
 * Workspace lease — prevents conflicting concurrent access.
 *
 * A workspace can only be leased by one session at a time. The lease
 * token is a unique string that must be presented for release/validation.
 */
export interface WorkspaceLease {
	/** The workspace this lease is for. */
	readonly workspaceId: WorkspaceId

	/** The session that holds this lease. */
	readonly sessionId: string

	/** ISO-8601 timestamp of when the lease was acquired. */
	readonly acquiredAt: string

	/** Optional ISO-8601 lease expiry timestamp. */
	readonly expiresAt?: string

	/** Unique token for lease validation. */
	readonly leaseToken: string
}

// ── Workspace snapshot ───────────────────────────────────────────────────

/**
 * Workspace snapshot — serializable state for persistence.
 */
export interface WorkspaceSnapshot {
	/** Workspace ID. */
	readonly id: WorkspaceId

	/** Snapshot of the workspace descriptor. */
	readonly descriptor: WorkspaceDescriptor

	/** Active lease, if any. */
	readonly lease?: WorkspaceLease

	/** IDs of tasks currently associated with this workspace. */
	readonly activeTaskIds: string[]

	/** ISO-8601 snapshot creation timestamp. */
	readonly createdAt: string
}

// ── Workspace recovery state ─────────────────────────────────────────────

/**
 * Workspace recovery state — tracks recovery progress for a workspace.
 */
export interface WorkspaceRecoveryState {
	/** The workspace being recovered. */
	readonly workspaceId: WorkspaceId

	/** Last known state before the crash/restart. */
	readonly lastKnownState: WorkspaceState

	/** Whether this workspace needs reconciliation. */
	readonly needsReconciliation: boolean

	/** Paths to orphaned worktrees that need cleanup. */
	readonly orphanedWorktrees: string[]

	/** Last error message, if any. */
	readonly lastError?: string
}

// ── Workspace filter ─────────────────────────────────────────────────────

/**
 * Filter criteria for listing workspaces.
 */
export interface WorkspaceFilter {
	/** Filter by workspace state. */
	readonly state?: WorkspaceState

	/** Filter by associated session. */
	readonly sessionId?: string

	/** Filter by associated repository. */
	readonly repositoryId?: string
}

// ── Workspace creation input ─────────────────────────────────────────────

/**
 * Input for creating a new workspace.
 */
export interface CreateWorkspaceInput {
	/** Human-readable workspace name. */
	readonly name: string

	/** Optional description. */
	readonly description?: string

	/** Absolute path to the workspace root directory. */
	readonly rootPath: string

	/** Optional session to associate with this workspace. */
	readonly sessionId?: string

	/** Optional repository ID. */
	readonly repositoryId?: string

	/** Optional git branch name for worktree creation. */
	readonly branchName?: string

	/** Whether to create a git worktree for this workspace. */
	readonly useWorktree?: boolean

	/** Arbitrary metadata. */
	readonly metadata?: Record<string, unknown>
}
