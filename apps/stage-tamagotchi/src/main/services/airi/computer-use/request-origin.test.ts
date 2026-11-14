import { afterEach, describe, expect, it, vi } from 'vitest'

import { PendingActionManager } from './action-manager'

const source = 71
const input = { sessionId: 'session-a', turnId: 'turn-a', text: 'Inspect the isolated fixture.' }
const attribution = { sessionId: input.sessionId, turnId: input.turnId, toolCallId: 'call-a', senderWebContentsId: source }

afterEach(() => {
  vi.useRealTimers()
})

describe('main request origin', () => {
  it('issues an independent request ID and keeps the original submitted input immutable', () => {
    const manager = new PendingActionManager()
    const submitted = { ...input }
    const request = manager.registerRequest(submitted, source)
    submitted.text = 'Replaced text'
    request.text = 'Replaced returned snapshot'

    const stored = manager.validateRequest(request.id, attribution)
    expect(stored.id).toMatch(/^req_[a-f0-9]{32}$/)
    expect(stored.id).not.toBe(input.turnId)
    expect(stored.text).toBe(input.text)
    expect(stored.senderWebContentsId).toBe(source)
  })

  it.each([
    { sessionId: 'session-b' },
    { turnId: 'turn-b' },
    { senderWebContentsId: 72 },
  ])('rejects replacement routing labels or execution source %j', (replacement) => {
    const manager = new PendingActionManager()
    const request = manager.registerRequest(input, source)
    expect(() => manager.validateRequest(request.id, { ...attribution, ...replacement })).toThrow()
  })

  it('rejects invented request IDs without starting an executor', () => {
    const manager = new PendingActionManager()
    expect(() => manager.validateRequest('req_invented', attribution)).toThrow(/Unknown Host request/)
  })

  // https://github.com/moeru-ai/airi/pull/3496
  // ROOT CAUSE:
  // Ended requests occupied the active quota until expiry.
  // Main now keeps only ended requests that a Terminal action still references.
  it.each(['finishRequest', 'cancelRequest'] as const)('reclaims requests without a Terminal action after %s', (end) => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const manager = new PendingActionManager()
    for (let index = 0; index < 1024; index++) {
      const request = manager.registerRequest({ ...input, turnId: `finished-${index}` }, source)
      manager[end](request.id, source)
    }

    const old = manager.registerRequest(input, source)
    manager[end](old.id, source)
    expect(() => manager.validateRequest(old.id, attribution, { allowClosed: true })).toThrow(/Unknown Host request/)
    const active = manager.registerRequest(input, source)
    expect(manager.validateRequest(active.id, attribution)).toMatchObject({ closed: false, cancelled: false })
  })

  it('rejects cancellation from another source and then invalidates the correct request', () => {
    const manager = new PendingActionManager()
    const request = manager.registerRequest(input, source)
    expect(() => manager.cancelRequest(request.id, 72)).toThrow()
    manager.cancelRequest(request.id, source)
    expect(() => manager.validateRequest(request.id, attribution, { allowClosed: true })).toThrow(/Unknown Host request/)
  })

  it('rejects expired requests with a controlled clock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const manager = new PendingActionManager()
    const request = manager.registerRequest(input, source)
    vi.setSystemTime(request.expiresAt)
    expect(() => manager.validateRequest(request.id, attribution)).toThrow(/expired/)
  })
})
