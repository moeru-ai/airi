import { describe, expect, it } from 'vitest'

import { createChatWsPayloadLimit } from './payload-limit'

describe('v2 chat WebSocket payload limit', () => {
  // https://github.com/moeru-ai/airi/pull/2309#discussion_r3818708552
  // ROOT CAUSE:
  //
  // The pre-authentication frame limit stayed on a socket after successful
  // authentication. Normal chat batches larger than that limit then failed.
  //
  // The limiter records each receiver's original limit and restores it when
  // the authentication handler completes.
  it('restores the original frame limit after authentication', () => {
    const socket = { _receiver: { _maxPayload: 100 * 1024 * 1024 } }
    const payloadLimit = createChatWsPayloadLimit(8192)

    payloadLimit.restrict(socket)
    expect(socket._receiver._maxPayload).toBe(8192)

    payloadLimit.restore(socket)
    expect(socket._receiver._maxPayload).toBe(100 * 1024 * 1024)
  })

  it('does not change sockets without a ws receiver', () => {
    const socket = {}
    const payloadLimit = createChatWsPayloadLimit(8192)

    payloadLimit.restrict(socket)
    payloadLimit.restore(socket)

    expect(socket).toEqual({})
  })
})
