import type { WebSocketEvents } from '@proj-airi/server-shared/types'

import type { CommandDestination } from './command-admission'
import type { AgentRun } from './run-table'

import { describe, expect, it } from 'vitest'

import { OWNER_AUDIENCE } from './audience'
import { admitCommand } from './command-admission'
import { LeaseTable } from './lease-table'

const command: WebSocketEvents['spark:command'] = {
  id: 'command',
  commandId: 'command',
  interrupt: false,
  priority: 'normal',
  intent: 'action',
  destinations: ['minecraft'],
}

function runIn(sessionId: string, salience = 0.5, state: AgentRun['state'] = 'working'): AgentRun {
  return { runId: `run-${sessionId}`, sessionId, state, salience, queuedAt: 0, envelope: { sessionId, bindings: [], outputs: ['chat:owner'], audience: OWNER_AUDIENCE } }
}

const minecraft: CommandDestination = { cognition: { accepts: ['action', 'plan'], control: { exclusive: true, leaseMs: 1_000 } } }

function directory(entries: Record<string, CommandDestination[]>) {
  return (name: string) => entries[name] ?? []
}

describe('command admission', () => {
  it('admits a command to a declared module and stamps the holding session', () => {
    const leases = new LeaseTable()

    const admission = admitCommand(command, { run: runIn('session-a'), destinations: directory({ minecraft: [minecraft] }), leases })

    expect(admission).toEqual({ ok: true, command: { ...command, holder: 'session-a' } })
    expect(leases.holder('module:minecraft')).toMatchObject({ holder: 'session-a', expiresAt: expect.any(Number) })
  })

  // ROOT CAUSE:
  // The chat tool emptied destinations, so every command reached every connected module.
  it('rejects a broadcast, an unknown module, and an intent that the module does not accept', () => {
    const leases = new LeaseTable()
    const destinations = directory({ minecraft: [minecraft], notes: [{}] })
    const run = runIn('session-a')

    expect(admitCommand({ ...command, destinations: [] }, { run, destinations, leases })).toEqual({ ok: false, reason: 'no-destination' })
    expect(admitCommand({ ...command, destinations: ['ghost'] }, { run, destinations, leases })).toMatchObject({ ok: false, reason: 'unknown-destination', destination: 'ghost' })
    expect(admitCommand({ ...command, destinations: ['notes'] }, { run, destinations, leases })).toMatchObject({ ok: false, reason: 'intent-not-accepted' })
    expect(admitCommand({ ...command, intent: 'reroute' }, { run, destinations, leases })).toMatchObject({ ok: false, reason: 'intent-not-accepted' })
    expect(leases.snapshot()).toEqual([])
  })

  it('rejects commands without a working run and commands to scene modules', () => {
    const leases = new LeaseTable()
    const destinations = directory({ discord: [{ cognition: { accepts: ['action'], scenes: [{ binding: 'discord:channel:' }] } }] })

    expect(admitCommand(command, { run: undefined, destinations, leases })).toEqual({ ok: false, reason: 'no-active-run' })
    expect(admitCommand(command, { run: runIn('a', 0.5, 'done'), destinations, leases })).toEqual({ ok: false, reason: 'no-active-run' })
    expect(admitCommand({ ...command, destinations: ['discord'] }, { run: runIn('a'), destinations, leases })).toMatchObject({ ok: false, reason: 'scene-destination' })
  })

  it('keeps module control with one session until it expires or critical work takes it', () => {
    let now = 0
    const leases = new LeaseTable({ now: () => now })
    const destinations = directory({ minecraft: [minecraft] })
    admitCommand(command, { run: runIn('session-a', 0.5), destinations, leases })

    // Another session cannot send contradictory orders while the lease lasts.
    expect(admitCommand(command, { run: runIn('session-b', 0.9), destinations, leases })).toMatchObject({ ok: false, reason: 'control-held' })
    // The holding session keeps control across its runs.
    expect(admitCommand(command, { run: { ...runIn('session-a'), runId: 'later-run' }, destinations, leases }).ok).toBe(true)
    // Critical work with higher salience takes control.
    expect(admitCommand({ ...command, priority: 'critical' }, { run: runIn('session-b', 0.9), destinations, leases })).toMatchObject({ ok: true, command: { holder: 'session-b' } })
    now = 2_000
    expect(admitCommand(command, { run: runIn('session-c', 0.1), destinations, leases }).ok).toBe(true)
  })
})
