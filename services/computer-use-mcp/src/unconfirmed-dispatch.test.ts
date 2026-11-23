import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ComputerUseSession } from './session'
import { createTestConfig } from './test-fixtures'
import { listUnconfirmedDispatches } from './unconfirmed-dispatch'

describe('listUnconfirmedDispatches', () => {
  it('keeps a dispatch that has no terminal event', () => {
    const open = listUnconfirmedDispatches([
      { event: 'dispatching', at: '2026-01-01T00:00:00.000Z', toolName: 'terminal_exec', result: { dispatchId: 'dispatch-1' } },
    ])

    expect(open).toEqual([
      { dispatchId: 'dispatch-1', toolName: 'terminal_exec', at: '2026-01-01T00:00:00.000Z' },
    ])
  })

  it('drops a dispatch after a later terminal event for the same id', () => {
    const open = listUnconfirmedDispatches([
      { event: 'dispatching', at: '2026-01-01T00:00:00.000Z', toolName: 'computer_act', result: { dispatchId: 'dispatch-1' } },
      { event: 'executed', at: '2026-01-01T00:00:01.000Z', toolName: 'computer_act', result: { dispatchId: 'dispatch-1' } },
      { event: 'requested', at: '2026-01-01T00:00:02.000Z', toolName: 'computer_act' },
    ])

    expect(open).toEqual([])
  })

  it('returns an empty list when the audit has no dispatch marker', () => {
    expect(listUnconfirmedDispatches([
      { event: 'requested', at: '2026-01-01T00:00:00.000Z', toolName: 'terminal_exec' },
    ])).toEqual([])
  })
})

describe('computerUseSession restart', () => {
  it('loads an unfinished dispatch and does not restore a pending action', async () => {
    const sessionRoot = await mkdtemp(join(tmpdir(), 'computer-use-unconfirmed-'))
    const config = createTestConfig({ sessionRoot })
    const first = new ComputerUseSession(config)
    await first.init()
    await first.record({
      event: 'dispatching',
      toolName: 'terminal_exec',
      action: { kind: 'terminal_exec', input: { command: 'Get-Date' } },
      context: { available: false, platform: 'linux' },
      policy: {
        allowed: true,
        requiresApproval: false,
        reason: 'test',
        reasons: ['test'],
        riskLevel: 'low',
        estimatedOperationUnits: 1,
      },
      result: { dispatchId: 'dispatch-1' },
    })

    const restarted = new ComputerUseSession(config)
    await restarted.init()

    expect(restarted.listPendingActions()).toEqual([])
    expect(restarted.getUnconfirmedDispatches()).toEqual([
      { dispatchId: 'dispatch-1', toolName: 'terminal_exec', at: expect.any(String) },
    ])
    expect(restarted.getRecentTrace(10)).toEqual([])
  })
})
