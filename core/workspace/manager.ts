/**
 * AIRI Core — Workspace Manager
 *
 * Manages the full lifecycle of workspaces: creation, destruction,
 * lease management, state transitions, and task association.
 *
 * Design decisions:
 * - State transitions are validated against VALID_WORKSPACE_TRANSITIONS.
 * - Lease tokens are cryptographically random UUIDs.
 * - All state transitions emit EventBus events for observability.
 * - Deterministic lifecycle: can't destroy an executing workspace.
 * - Recoverable after crash/restart via WorkspaceStorage.
 */

import type { EventBus } from '../events/bus.js'
import type { Logger } from '../logger.js'
import type {
  WorkspaceId,
  WorkspaceState,
  WorkspaceDescriptor,
  WorkspaceLease,
  WorkspaceFilter,
  WorkspaceSnapshot,
  CreateWorkspaceInput,
} from './types.js'
import { createWorkspaceId, isValidWorkspaceTransition } from './types.js'

// ── Workspace Manager Options ────────────────────────────────────────────

export interface WorkspaceManagerOptions {
  /** Base filesystem path for all workspace directories. */
  readonly basePath: string

  /** Optional logger for workspace lifecycle events. */
  readonly logger?: Logger
}

// ── Workspace Manager ────────────────────────────────────────────────────

/**
 * Manages workspace lifecycle: creation, destruction, lease, state transitions.
 */
export class WorkspaceManager {
  private readonly events: EventBus
  private readonly logger: Logger

  /** Map of workspace ID → descriptor. */
  private readonly workspaces = new Map<WorkspaceId, WorkspaceDescriptor>()

  /** Map of workspace ID → active lease. */
  private readonly leases = new Map<WorkspaceId, WorkspaceLease>()

  /** Map of workspace ID → set of associated task IDs. */
  private readonly workspaceTasks = new Map<WorkspaceId, Set<string>>()

  constructor(options: WorkspaceManagerOptions, events: EventBus) {
    this.events = events
    this.logger = options.logger ?? {
      debug: () => {
        /* noop */
      },
      info: () => {
        /* noop */
      },
      warn: () => {
        /* noop */
      },
      error: () => {
        /* noop */
      },
    }
  }

  // ── Create ─────────────────────────────────────────────────────────────

  /**
   * Create a new workspace.
   *
   * @param input - Workspace creation parameters.
   * @returns The created workspace descriptor.
   */
  createWorkspace(input: CreateWorkspaceInput): WorkspaceDescriptor {
    const now = new Date().toISOString()
    const id = createWorkspaceId(`ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)

    const descriptor: WorkspaceDescriptor = {
      id,
      name: input.name,
      description: input.description,
      rootPath: input.rootPath,
      state: 'active',
      sessionId: input.sessionId,
      repositoryId: input.repositoryId,
      branchName: input.branchName,
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata ?? {},
    }

    this.workspaces.set(id, descriptor)
    this.workspaceTasks.set(id, new Set())

    this.logger.info(`Workspace ${id} "${input.name}" created at ${input.rootPath}`)

    // Emit workspace.created event.
    this.events.emit('workspace.created', {
      timestamp: now,
      source: 'workspace-manager',
      workspaceId: id as string,
      name: input.name,
      rootPath: input.rootPath,
      sessionId: input.sessionId,
      repositoryId: input.repositoryId,
      branchName: input.branchName,
    })

    return descriptor
  }

  // ── Destroy ────────────────────────────────────────────────────────────

  /**
   * Destroy a workspace and clean up all associated resources.
   *
   * @param workspaceId - The workspace to destroy.
   * @throws Error if the workspace is in "executing" state.
   */
  destroyWorkspace(workspaceId: WorkspaceId): void {
    const descriptor = this.workspaces.get(workspaceId)
    if (!descriptor) {
      throw new Error(`Workspace not found: ${workspaceId}`)
    }

    // Validate state transition.
    if (!isValidWorkspaceTransition(descriptor.state, 'destroying')) {
      throw new Error(
        `Cannot destroy workspace ${workspaceId} in state "${descriptor.state}": ` +
          `valid transitions are ${isValidWorkspaceTransition(descriptor.state, 'destroying') ? 'allowed' : 'blocked'}`,
      )
    }

    // Release lease if held.
    if (this.leases.has(workspaceId)) {
      const lease = this.leases.get(workspaceId)!
      this.releaseWorkspace(workspaceId, lease.leaseToken)
    }

    // Update state to destroying, then destroyed.
    const now = new Date().toISOString()
    const destroying: WorkspaceDescriptor = { ...descriptor, state: 'destroying', updatedAt: now }
    this.workspaces.set(workspaceId, destroying)

    // Clean up task associations.
    this.workspaceTasks.delete(workspaceId)

    // Mark as destroyed.
    const destroyed: WorkspaceDescriptor = { ...destroying, state: 'destroyed', updatedAt: now }
    this.workspaces.set(workspaceId, destroyed)

    this.logger.info(`Workspace ${workspaceId} destroyed`)

    // Emit workspace.destroyed event.
    this.events.emit('workspace.destroyed', {
      timestamp: now,
      source: 'workspace-manager',
      workspaceId: workspaceId as string,
      name: descriptor.name,
    })
  }

  // ── Get / List ─────────────────────────────────────────────────────────

  /**
   * Get a workspace descriptor by ID.
   */
  getWorkspace(workspaceId: WorkspaceId): WorkspaceDescriptor | undefined {
    return this.workspaces.get(workspaceId)
  }

  /**
   * List workspaces, optionally filtered.
   */
  listWorkspaces(filter?: WorkspaceFilter): WorkspaceDescriptor[] {
    const all = [...this.workspaces.values()]

    if (!filter) return all

    return all.filter((ws) => {
      if (filter.state && ws.state !== filter.state) return false
      if (filter.sessionId && ws.sessionId !== filter.sessionId) return false
      if (filter.repositoryId && ws.repositoryId !== filter.repositoryId) return false
      return true
    })
  }

  // ── Lease management ───────────────────────────────────────────────────

  /**
   * Acquire a lease on a workspace.
   *
   * A workspace can only be leased by one session at a time. Throws if
   * the workspace is already leased.
   *
   * @param workspaceId - The workspace to lease.
   * @param sessionId - The session requesting the lease.
   * @param durationMs - Optional lease duration in milliseconds.
   * @returns The workspace lease.
   * @throws Error if the workspace is already leased or not found.
   */
  leaseWorkspace(workspaceId: WorkspaceId, sessionId: string, durationMs?: number): WorkspaceLease {
    const descriptor = this.workspaces.get(workspaceId)
    if (!descriptor) {
      throw new Error(`Workspace not found: ${workspaceId}`)
    }

    // Check for existing lease.
    if (this.leases.has(workspaceId)) {
      const existing = this.leases.get(workspaceId)!
      throw new Error(`Workspace ${workspaceId} is already leased by session ${existing.sessionId}`)
    }

    const now = new Date()
    const lease: WorkspaceLease = {
      workspaceId,
      sessionId,
      acquiredAt: now.toISOString(),
      expiresAt: durationMs ? new Date(now.getTime() + durationMs).toISOString() : undefined,
      leaseToken: crypto.randomUUID(),
    }

    this.leases.set(workspaceId, lease)

    // Update workspace state.
    this.updateWorkspaceState(workspaceId, 'leased')

    this.logger.info(`Workspace ${workspaceId} leased to session ${sessionId}`)

    // Emit workspace.leased event.
    this.events.emit('workspace.leased', {
      timestamp: now.toISOString(),
      source: 'workspace-manager',
      workspaceId: workspaceId as string,
      sessionId,
      leaseToken: lease.leaseToken,
      expiresAt: lease.expiresAt,
    })

    return lease
  }

  /**
   * Release a workspace lease.
   *
   * @param workspaceId - The workspace to release.
   * @param leaseToken - The lease token for validation.
   * @throws Error if the lease token doesn't match.
   */
  releaseWorkspace(workspaceId: WorkspaceId, leaseToken: string): void {
    const lease = this.leases.get(workspaceId)
    if (!lease) {
      throw new Error(`No active lease for workspace ${workspaceId}`)
    }

    if (lease.leaseToken !== leaseToken) {
      throw new Error(`Invalid lease token for workspace ${workspaceId}`)
    }

    this.leases.delete(workspaceId)

    // Update workspace state back to active.
    this.updateWorkspaceState(workspaceId, 'active')

    this.logger.info(`Workspace ${workspaceId} lease released by session ${lease.sessionId}`)

    // Emit workspace.released event.
    this.events.emit('workspace.released', {
      timestamp: new Date().toISOString(),
      source: 'workspace-manager',
      workspaceId: workspaceId as string,
      sessionId: lease.sessionId,
      leaseToken: lease.leaseToken,
    })
  }

  /**
   * Validate a workspace lease.
   *
   * @returns true if the lease is valid (exists and token matches).
   */
  validateLease(workspaceId: WorkspaceId, leaseToken: string): boolean {
    const lease = this.leases.get(workspaceId)
    if (!lease) return false
    if (lease.leaseToken !== leaseToken) return false

    // Check expiry.
    if (lease.expiresAt) {
      const expiry = new Date(lease.expiresAt).getTime()
      const isExpired = Date.now() >= expiry
      if (isExpired) return false
    }

    return true
  }

  // ── State transitions ──────────────────────────────────────────────────

  /**
   * Update the workspace state.
   *
   * Validates the transition against VALID_WORKSPACE_TRANSITIONS.
   */
  updateWorkspaceState(workspaceId: WorkspaceId, newState: WorkspaceState): WorkspaceDescriptor {
    const descriptor = this.workspaces.get(workspaceId)
    if (!descriptor) {
      throw new Error(`Workspace not found: ${workspaceId}`)
    }

    if (!isValidWorkspaceTransition(descriptor.state, newState)) {
      throw new Error(`Invalid state transition for workspace ${workspaceId}: "${descriptor.state}" → "${newState}"`)
    }

    const updated: WorkspaceDescriptor = {
      ...descriptor,
      state: newState,
      updatedAt: new Date().toISOString(),
    }

    this.workspaces.set(workspaceId, updated)
    this.logger.debug(`Workspace ${workspaceId} state: "${descriptor.state}" → "${newState}"`)

    return updated
  }

  // ── Task association ───────────────────────────────────────────────────

  /**
   * Associate a task with a workspace.
   */
  associateTask(workspaceId: WorkspaceId, taskId: string): void {
    const descriptor = this.workspaces.get(workspaceId)
    if (!descriptor) {
      throw new Error(`Workspace not found: ${workspaceId}`)
    }

    const tasks = this.workspaceTasks.get(workspaceId) ?? new Set()
    tasks.add(taskId)
    this.workspaceTasks.set(workspaceId, tasks)

    this.logger.debug(`Task ${taskId} associated with workspace ${workspaceId}`)
  }

  /**
   * Disassociate a task from a workspace.
   */
  disassociateTask(workspaceId: WorkspaceId, taskId: string): void {
    const tasks = this.workspaceTasks.get(workspaceId)
    if (tasks) {
      tasks.delete(taskId)
    }

    this.logger.debug(`Task ${taskId} disassociated from workspace ${workspaceId}`)
  }

  /**
   * Get the set of active task IDs for a workspace.
   */
  getActiveTasks(workspaceId: WorkspaceId): string[] {
    const tasks = this.workspaceTasks.get(workspaceId)
    return tasks ? [...tasks] : []
  }

  // ── Snapshot / Recovery ────────────────────────────────────────────────

  /**
   * Create a snapshot of all workspace state.
   */
  snapshot(): WorkspaceSnapshot[] {
    const snapshots: WorkspaceSnapshot[] = []

    for (const [id, descriptor] of this.workspaces) {
      const lease = this.leases.get(id)
      const tasks = this.workspaceTasks.get(id)

      snapshots.push({
        id,
        descriptor,
        lease: lease ?? undefined,
        activeTaskIds: tasks ? [...tasks] : [],
        createdAt: new Date().toISOString(),
      })
    }

    return snapshots
  }

  /**
   * Restore workspace state from snapshots.
   */
  restoreFromSnapshots(snapshots: WorkspaceSnapshot[]): number {
    let restored = 0

    for (const snap of snapshots) {
      this.workspaces.set(snap.id, snap.descriptor)

      if (snap.lease) {
        this.leases.set(snap.id, snap.lease)
      }

      this.workspaceTasks.set(snap.id, new Set(snap.activeTaskIds))
      restored++
    }

    this.logger.info(`Restored ${restored} workspaces from snapshots`)
    return restored
  }

  // ── Query ──────────────────────────────────────────────────────────────

  /**
   * Get the total number of workspaces.
   */
  get count(): number {
    return this.workspaces.size
  }

  /**
   * Get all workspace IDs.
   */
  get workspaceIds(): WorkspaceId[] {
    return [...this.workspaces.keys()]
  }
}
