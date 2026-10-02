import type { ModuleCognition, WebSocketEvents } from '@proj-airi/server-shared/types'

import type { LeaseTable } from './lease-table'
import type { AgentRun } from './run-table'

type SparkCommand = WebSocketEvents['spark:command']

/** What the admission needs to know about one connected module instance. */
export interface CommandDestination {
  cognition?: ModuleCognition
  /** Set when the module sent an invalid declaration. */
  declarationError?: string
}

/** Why a command never left the host. */
export type CommandRejection
  = | 'no-active-run'
    | 'no-destination'
    | 'unknown-destination'
    | 'invalid-declaration'
    | 'scene-destination'
    | 'intent-not-accepted'
    | 'control-held'

export type CommandAdmission
  = | { ok: true, command: SparkCommand }
    | { ok: false, reason: CommandRejection, destination?: string }

const DEFAULT_CONTROL_LEASE_MS = 60_000

/** Lease resource for control of one module. */
export function moduleControlResource(name: string) {
  return `module:${name}`
}

/**
 * Admits one `spark:command` from a run. Model output never grants module control by itself.
 *
 * Use when:
 * - A tool call or a notification run wants to send a command to modules.
 *
 * Expects:
 * - `destinations` lists the connected instances of a module name. An unknown name returns none.
 *
 * Returns:
 * - The command with `holder` set to the run's session, after every check passes and every exclusive control lease is held.
 * - A rejection for an inactive run, a broadcast, an undeclared module, an unaccepted intent, or control that another session holds.
 *   A rejected command acquires no lease.
 */
export function admitCommand(command: SparkCommand, context: {
  run: AgentRun | undefined
  destinations: (name: string) => CommandDestination[]
  leases: LeaseTable
}): CommandAdmission {
  const { run, leases } = context
  if (!run || run.state !== 'working')
    return { ok: false, reason: 'no-active-run' }
  if (!command.destinations.length)
    return { ok: false, reason: 'no-destination' }

  const holder = run.sessionId
  const salience = run.salience ?? 0.5
  // A critical command can take control from lower-salience work. Others wait for the lease to end.
  const preempt = command.priority === 'critical'
  const controlled: Array<{ resource: string, ttlMs: number }> = []
  for (const name of command.destinations) {
    const instances = context.destinations(name)
    if (!instances.length)
      return { ok: false, reason: 'unknown-destination', destination: name }
    if (instances.some(instance => instance.declarationError))
      return { ok: false, reason: 'invalid-declaration', destination: name }
    // A scene module reaches other people. No scene module accepts commands yet, so none receives one.
    if (instances.some(instance => instance.cognition?.scenes?.length))
      return { ok: false, reason: 'scene-destination', destination: name }
    if (!instances.every(instance => instance.cognition?.accepts?.includes(command.intent)))
      return { ok: false, reason: 'intent-not-accepted', destination: name }

    const control = instances.find(instance => instance.cognition?.control?.exclusive)?.cognition?.control
    if (!control)
      continue
    const resource = moduleControlResource(name)
    const current = leases.holder(resource)
    if (current && current.holder !== holder && (!preempt || !(salience > current.salience)))
      return { ok: false, reason: 'control-held', destination: name }
    controlled.push({ resource, ttlMs: control.leaseMs ?? DEFAULT_CONTROL_LEASE_MS })
  }

  for (const { resource, ttlMs } of controlled)
    leases.acquire(resource, holder, { salience, ttlMs, preempt })
  return { ok: true, command: { ...command, holder } }
}
