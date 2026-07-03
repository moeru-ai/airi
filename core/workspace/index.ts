/**
 * AIRI Core — Workspace Layer
 *
 * Barrel export for workspace isolation infrastructure.
 */

export { WorkspaceManager } from './manager.js'

export type { WorkspaceManagerOptions } from './manager.js'

export { WorkspaceStorage } from './storage.js'
export {
  createWorkspaceId,
  isValidWorkspaceTransition,
  VALID_WORKSPACE_TRANSITIONS,
} from './types.js'

export type {
  CreateWorkspaceInput,
  WorkspaceDescriptor,
  WorkspaceFilter,
  WorkspaceId,
  WorkspaceLease,
  WorkspaceRecoveryState,
  WorkspaceSnapshot,
  WorkspaceState,
} from './types.js'
export { WorkspaceWorktree } from './worktree.js'
export type { WorktreeRecord } from './worktree.js'
