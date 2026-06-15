/**
 * AIRI Core — Workspace Layer
 *
 * Barrel export for workspace isolation infrastructure.
 */

export {
	createWorkspaceId,
	isValidWorkspaceTransition,
	VALID_WORKSPACE_TRANSITIONS,
} from "./types.js"

export type {
	WorkspaceId,
	WorkspaceState,
	WorkspaceDescriptor,
	WorkspaceLease,
	WorkspaceSnapshot,
	WorkspaceRecoveryState,
	WorkspaceFilter,
	CreateWorkspaceInput,
} from "./types.js"

export { WorkspaceManager } from "./manager.js"
export type { WorkspaceManagerOptions } from "./manager.js"

export { WorkspaceStorage } from "./storage.js"
export { WorkspaceWorktree } from "./worktree.js"
export type { WorktreeRecord } from "./worktree.js"
