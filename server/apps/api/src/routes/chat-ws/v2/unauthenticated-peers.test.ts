import { describe, expect, it } from 'vitest'

import { createChatWsUnauthenticatedPeerLimit } from './unauthenticated-peers'

describe('v2 chat unauthenticated peer limit', () => {
  // https://github.com/moeru-ai/airi/pull/2309#discussion_r3811138375
  // ROOT CAUSE:
  //
  // v2 upgrades before the client proves identity. Without a cap, unauthenticated
  // sockets each retained an Eventa context and an authentication timer for up
  // to fifteen seconds.
  //
  // The per-process limiter rejects peers once full and returns capacity only
  // when a reserved slot is released.
  it('does not admit more unauthenticated peers than its configured capacity', () => {
    const limit = createChatWsUnauthenticatedPeerLimit(2)

    expect(limit.tryAcquire()).toBe(true)
    expect(limit.tryAcquire()).toBe(true)
    expect(limit.tryAcquire()).toBe(false)

    limit.release()

    expect(limit.tryAcquire()).toBe(true)
  })

  it('does not create capacity when a peer is released more than once', () => {
    const limit = createChatWsUnauthenticatedPeerLimit(1)

    expect(limit.tryAcquire()).toBe(true)
    limit.release()
    limit.release()

    expect(limit.tryAcquire()).toBe(true)
    expect(limit.tryAcquire()).toBe(false)
  })
})
