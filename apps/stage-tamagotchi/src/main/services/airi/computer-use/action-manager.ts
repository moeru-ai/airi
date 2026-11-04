/**
 * Main-owned PendingAction store and Minimal Approval Contract.
 * Enforces single-use atomic consumption, parameter matching, attribution verification,
 * and conservative target-binding preconditions.
 */

import type { InvocationAttribution } from './attribution'
import type { AuvCommandClassification } from './classifier'

import { randomUUID } from 'node:crypto'

import { validateAttribution } from './attribution'
import { classifyAuvCommand } from './classifier'

export type PendingActionStatus
  = | 'pending'
    | 'approved'
    | 'rejected'
    | 'consumed'
    | 'cancelled'
    | 'expired'

export interface PendingActionSettlement {
  outcome: 'success' | 'failed'
  exitCode?: number
  error?: string
  settledAt: number
}

export interface PendingAction {
  /** Unique action ID */
  id: string
  /** Trusted caller attribution (session, turn, toolCall, sender) */
  attribution: InvocationAttribution
  /** Immutable arguments frozen at registration */
  argv: readonly string[]
  /** Classification result */
  classification: AuvCommandClassification
  /** Command name (e.g. 'input.clickPoint', 'window.clickText') */
  command: string
  /** Resolved target (e.g. 'app:notepad', 'window:1234'), if specified */
  target?: string
  /** Current approval / consumption lifecycle status */
  status: PendingActionStatus
  createdAt: number
  expiresAt: number
  settlement?: PendingActionSettlement
}

/**
 * Commands that inject user input (clicks, keys, mouse, text) into the OS.
 * These commands MUST be bound to an explicit target window/app to prevent
 * accidental foreground divergence into arbitrary windows.
 */
const MUTATING_INPUT_COMMANDS = new Set<string>([
  'input.clickPoint',
  'input.typeText',
  'input.pasteText',
  'input.key',
  'input.keys',
  'input.pressKeys',
  'input.holdKeys',
  'input.keyboard',
  'input.moveMouse',
  'input.scrollPoint',
  'input.drag',
  'input.scroll',
  'input.scrollUntil',
  'input.focusText',
  'input.axFocusText',
  'screen.clickText',
  'window.clickText',
])

/**
 * Extracts explicit target from command argv.
 * Matches '--target <val>', '--target=<val>', or 'app.activate <app>'.
 */
export function extractTarget(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i]
    if (item === '--target' && i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
      return argv[i + 1]
    }
    if (item.startsWith('--target=')) {
      const val = item.slice('--target='.length)
      if (val.length > 0)
        return val
    }
  }

  // app.activate takes the target app as the next positional parameter: ['invoke', 'app.activate', '<target>']
  if (argv[0] === 'invoke' && argv[1] === 'app.activate' && argv[2] && !argv[2].startsWith('-')) {
    return argv[2]
  }

  return undefined
}

/**
 * Verifies execution preconditions based on concrete command type.
 * Rejects unbound foreground input mutations to eliminate window-switch race conditions.
 */
export function verifyExecutionPreconditions(command: string, argv: readonly string[]): { target?: string } {
  const target = extractTarget(argv)

  if (MUTATING_INPUT_COMMANDS.has(command) && !target) {
    throw new Error(
      `Precondition failed: Mutating operation '${command}' is rejected: operation is unbound from an explicit target window or app (--target is required).`,
    )
  }

  // A CLI flag alone does not prove that Windows input is delivered to that target.
  // Keep input closed until the executor supplies a target-bound execution contract.
  if (MUTATING_INPUT_COMMANDS.has(command))
    throw new Error(`Target-bound input execution is not enabled for '${command}'.`)

  return { target }
}

/**
 * Owns approval state. Queued actions remain approved and cancellable until execution consumes them.
 * Consumed actions never regain approval and accept exactly one execution settlement.
 * All public records are detached snapshots. Source, session, turn, call and arguments bind each approval.
 */
export class PendingActionManager {
  private actions = new Map<string, PendingAction>()
  private defaultTtlMs = 60_000 // 60 seconds

  constructor(options?: { defaultTtlMs?: number }) {
    if (options?.defaultTtlMs) {
      this.defaultTtlMs = options.defaultTtlMs
    }
  }

  /**
   * Registers a new PendingAction for a mutating command.
   */
  createPendingAction(params: {
    attribution: InvocationAttribution
    argv: readonly string[]
    ttlMs?: number
  }): PendingAction {
    const attribution = validateAttribution(params.attribution, params.attribution.senderWebContentsId)
    if (!attribution.turnId || !attribution.toolCallId || typeof attribution.senderWebContentsId !== 'number'
      || !Number.isSafeInteger(attribution.senderWebContentsId) || attribution.senderWebContentsId <= 0) {
      throw new Error('Pending actions require a session, turn, tool call and verified Electron sender.')
    }
    const frozenArgv = Object.freeze([...params.argv])
    const classification = classifyAuvCommand(frozenArgv)

    if (classification.category !== 'mutating') {
      throw new Error(`Only mutating commands require a PendingAction; received '${classification.category}'.`)
    }

    const command = classification.command ?? 'unknown'
    const target = extractTarget(frozenArgv)
    const now = Date.now()
    const id = `act_${randomUUID().replace(/-/g, '')}`

    const action: PendingAction = {
      id,
      attribution,
      argv: frozenArgv,
      classification,
      command,
      target,
      status: 'pending',
      createdAt: now,
      expiresAt: now + (params.ttlMs ?? this.defaultTtlMs),
    }

    this.actions.set(id, action)
    return structuredClone(action)
  }

  private read(id: string): PendingAction | undefined {
    const action = this.actions.get(id)
    if (!action)
      return undefined

    // Automatic expiration check
    if (action.status === 'pending' || action.status === 'approved') {
      if (Date.now() >= action.expiresAt) {
        action.status = 'expired'
      }
    }

    return action
  }

  /** Returns current approval state without exposing mutable host records. */
  get(id: string): PendingAction | undefined {
    const action = this.read(id)
    return action ? structuredClone(action) : undefined
  }

  /**
   * Approves a pending action.
   */
  approve(id: string): PendingAction {
    const action = this.read(id)
    if (!action) {
      throw new Error(`Pending action '${id}' not found.`)
    }

    if (action.status === 'expired') {
      throw new Error(`Pending action '${id}' has expired.`)
    }

    if (action.status !== 'pending') {
      throw new Error(`Pending action '${id}' cannot be approved: current status is '${action.status}'.`)
    }

    action.status = 'approved'
    return structuredClone(action)
  }

  /**
   * Rejects a pending action.
   */
  reject(id: string, reason?: string): PendingAction {
    const action = this.read(id)
    if (!action) {
      throw new Error(`Pending action '${id}' not found.`)
    }

    if (action.status !== 'pending') {
      throw new Error(`Pending action '${id}' cannot be rejected: current status is '${action.status}'.`)
    }

    action.status = 'rejected'
    action.settlement = {
      outcome: 'failed',
      error: reason ?? 'Rejected by human reviewer',
      settledAt: Date.now(),
    }
    return structuredClone(action)
  }

  /**
   * Cancels a pending action (e.g. task aborted or session closed).
   */
  cancel(id: string, reason?: string): PendingAction {
    const action = this.read(id)
    if (!action) {
      throw new Error(`Pending action '${id}' not found.`)
    }

    if (action.status !== 'pending' && action.status !== 'approved')
      throw new Error(`Pending action '${id}' cannot be cancelled: current status is '${action.status}'.`)

    action.status = 'cancelled'
    action.settlement = {
      outcome: 'failed',
      error: reason ?? 'Cancelled',
      settledAt: Date.now(),
    }
    return structuredClone(action)
  }

  /** Checks approval state, expiry, exact request origin, arguments and executor admission without changing consumption state. */
  private validateAction(
    id: string,
    request: {
      argv: readonly string[]
      attribution: InvocationAttribution
    },
  ): PendingAction {
    const action = this.read(id)
    if (!action) {
      throw new Error(`Pending action '${id}' not found.`)
    }

    if (action.status === 'consumed') {
      throw new Error(`Pending action '${id}' has already been consumed (replay rejected).`)
    }

    if (action.status === 'expired') {
      throw new Error(`Pending action '${id}' has expired.`)
    }

    if (action.status === 'pending') {
      throw new Error(`Pending action '${id}' has not been approved.`)
    }

    if (action.status === 'rejected') {
      throw new Error(`Pending action '${id}' was rejected.`)
    }

    if (action.status === 'cancelled') {
      throw new Error(`Pending action '${id}' was cancelled.`)
    }

    if (action.status !== 'approved') {
      throw new Error(`Pending action '${id}' is not in approved state: '${action.status}'.`)
    }

    // 1. Parameter match check
    if (action.argv.length !== request.argv.length || !action.argv.every((val, idx) => val === request.argv[idx])) {
      throw new Error(
        `Pending action '${id}' parameter mismatch: approved arguments do not match requested execution arguments.`,
      )
    }

    // 2. Attribution match check (multi-session cross-contamination guard)
    if (action.attribution.sessionId !== request.attribution.sessionId) {
      throw new Error(
        `Pending action '${id}' attribution mismatch: action was authorized for session '${action.attribution.sessionId}', but requested by session '${request.attribution.sessionId}'.`,
      )
    }

    for (const field of ['turnId', 'toolCallId', 'senderWebContentsId'] as const) {
      if (action.attribution[field] !== request.attribution[field])
        throw new Error(`Pending action '${id}' attribution mismatch: ${field} differs from the approved request.`)
    }

    // 3. Execution preconditions check (conservative target check)
    verifyExecutionPreconditions(action.command, action.argv)

    return action
  }

  /** Checks admission before queueing without consuming or reserving the approval. */
  validate(id: string, request: { argv: readonly string[], attribution: InvocationAttribution }): void {
    this.validateAction(id, request)
  }

  /** Rechecks expiry, provenance and arguments at execution start, then consumes once without awaiting. */
  consume(id: string, request: { argv: readonly string[], attribution: InvocationAttribution }): PendingAction {
    const action = this.validateAction(id, request)
    action.status = 'consumed'
    return structuredClone(action)
  }

  /**
   * Settles an action after execution finishes.
   */
  settle(id: string, outcome: { outcome: 'success' | 'failed', exitCode?: number, error?: string }): void {
    const action = this.actions.get(id)
    if (!action || action.status !== 'consumed' || action.settlement)
      throw new Error(`Pending action '${id}' must be consumed and unsettled before settlement.`)
    action.settlement = { ...outcome, settledAt: Date.now() }
  }

  /** Cancels waiting actions of this source and turn. Other turns and committed executions retain their state. */
  cancelInvocation(attribution: InvocationAttribution, reason?: string): number {
    const now = Date.now()
    let count = 0
    for (const action of this.actions.values()) {
      if (action.attribution.sessionId === attribution.sessionId
        && action.attribution.turnId === attribution.turnId
        && action.attribution.senderWebContentsId === attribution.senderWebContentsId
        && (action.status === 'pending' || action.status === 'approved')) {
        action.status = 'cancelled'
        action.settlement = {
          outcome: 'failed',
          error: reason ?? 'Request or session was cancelled',
          settledAt: now,
        }
        count++
      }
    }
    return count
  }

  /** Invalidates waiting approvals when their renderer is destroyed. In-flight work retains its real settlement. */
  cancelBySender(senderWebContentsId: number): void {
    for (const action of this.actions.values()) {
      if (action.attribution.senderWebContentsId === senderWebContentsId && (action.status === 'pending' || action.status === 'approved'))
        this.cancel(action.id, 'Source renderer closed')
    }
  }

  /**
   * Invalidates and cancels all active actions (e.g. host shutdown).
   */
  invalidateAll(): void {
    const now = Date.now()
    for (const action of this.actions.values()) {
      if (action.status === 'pending' || action.status === 'approved') {
        action.status = 'cancelled'
        action.settlement = {
          outcome: 'failed',
          error: 'Host runtime disposed or reset',
          settledAt: now,
        }
      }
    }
  }
}
