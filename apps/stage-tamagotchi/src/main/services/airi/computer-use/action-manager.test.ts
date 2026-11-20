import type { InvocationAttribution } from './attribution'

import { describe, expect, it } from 'vitest'

import { PendingActionManager } from './action-manager'

const attribution: InvocationAttribution = {
  sessionId: 'session-a',
  turnId: 'turn-a',
  toolCallId: 'call-a',
  senderWebContentsId: 1,
}
const argv = ['invoke', 'app.activate', 'Calculator']

describe('pending action provenance', () => {
  it.each([
    { turnId: 'another-turn' },
    { toolCallId: 'another-call' },
    { senderWebContentsId: 2 },
  ])('rejects another request or source: %j', (changed) => {
    const manager = new PendingActionManager()
    const action = manager.createPendingAction({ argv, attribution })
    manager.approve(action.id)

    expect(() => manager.consume(action.id, {
      argv,
      attribution: { ...attribution, ...changed },
    })).toThrow(/attribution mismatch/)
    expect(manager.get(action.id)?.status).toBe('approved')
  })

  it('keeps returned records from changing the approved operation', () => {
    const manager = new PendingActionManager()
    const action = manager.createPendingAction({ argv, attribution })
    manager.approve(action.id)
    const snapshot = manager.get(action.id)!
    snapshot.status = 'cancelled'

    expect(manager.get(action.id)?.status).toBe('approved')
  })

  it('does not settle an action that never started', () => {
    const manager = new PendingActionManager()
    const action = manager.createPendingAction({ argv, attribution })

    expect(() => manager.settle(action.id, { outcome: 'success' })).toThrow(/consumed/)
    expect(manager.get(action.id)?.settlement).toBeUndefined()
  })

  it.each(['turnId', 'toolCallId', 'senderWebContentsId'] as const)('requires %s before registering approval', (field) => {
    const manager = new PendingActionManager()
    expect(() => manager.createPendingAction({ argv, attribution: { ...attribution, [field]: undefined } })).toThrow(/verified Electron sender/)
  })

  it('does not overwrite the first settlement or restore a failed approval', () => {
    const manager = new PendingActionManager()
    const action = manager.createPendingAction({ argv, attribution })
    manager.approve(action.id)
    manager.consume(action.id, { argv, attribution })
    manager.settle(action.id, { outcome: 'failed', error: 'Execution failed' })
    expect(() => manager.settle(action.id, { outcome: 'success' })).toThrow(/unsettled/)
    expect(() => manager.consume(action.id, { argv, attribution })).toThrow(/already been consumed/)
    expect(manager.get(action.id)?.settlement?.outcome).toBe('failed')
  })
})
