import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WS_CLOSE_INTERNAL_ERROR, WS_CLOSE_TRY_AGAIN_LATER, WS_CLOSE_UNAUTHORIZED } from '../../../libs/ws-auth'
import { createChatWsV2Authentication } from './auth'

interface Deferred<T> {
  promise: Promise<T>
  reject: (error: Error) => void
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let reject: (error: Error) => void = () => {}
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function createAuthentication(resolveUserId: (token: string) => Promise<string | null>) {
  const close = vi.fn<(code?: number, reason?: string) => void>()
  const onAuthenticated = vi.fn()
  const authentication = createChatWsV2Authentication({
    socket: { close },
    resolveUserId,
    onAuthenticated,
  })
  return { authentication, close, onAuthenticated }
}

describe('v2 chat WebSocket authentication', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // https://github.com/moeru-ai/airi/pull/2309#discussion_r3796626514
  // https://github.com/moeru-ai/airi/pull/2309#discussion_r3796626537
  // ROOT CAUSE:
  //
  // An authentication resolver can finish after the socket closes or after a
  // timeout. The old handler registered that disconnected context and allowed
  // concurrent requests to repeat the resolver work.
  //
  // The authentication session now accepts one attempt, marks the socket
  // inactive before it closes, and refuses a late resolver result.
  it('does not authenticate after disconnecting during authentication', async () => {
    const deferred = createDeferred<string | null>()
    const resolveUserId = vi.fn(() => deferred.promise)
    const { authentication, onAuthenticated } = createAuthentication(resolveUserId)

    const request = authentication.authenticate({ token: 'valid-token' })
    authentication.disconnect()
    deferred.resolve('user-1')

    await expect(request).rejects.toThrow('WebSocket closed during authentication')
    expect(onAuthenticated).not.toHaveBeenCalled()
  })

  it('limits each socket to one authentication attempt', async () => {
    const deferred = createDeferred<string | null>()
    const resolveUserId = vi.fn(() => deferred.promise)
    const { authentication } = createAuthentication(resolveUserId)

    const first = authentication.authenticate({ token: 'valid-token' })
    await expect(authentication.authenticate({ token: 'valid-token' })).rejects.toThrow('WebSocket authentication already attempted')
    expect(resolveUserId).toHaveBeenCalledTimes(1)

    deferred.resolve('user-1')
    await expect(first).resolves.toEqual({ userId: 'user-1' })
  })

  it('uses a retryable code when authentication times out', async () => {
    const deferred = createDeferred<string | null>()
    const { authentication, close, onAuthenticated } = createAuthentication(() => deferred.promise)

    const request = authentication.authenticate({ token: 'valid-token' })
    await vi.advanceTimersByTimeAsync(15_000)
    deferred.resolve('user-1')

    await expect(request).rejects.toThrow('WebSocket closed during authentication')
    expect(close).toHaveBeenCalledWith(WS_CLOSE_TRY_AGAIN_LATER, 'authentication timeout')
    expect(close).not.toHaveBeenCalledWith(WS_CLOSE_UNAUTHORIZED, 'unauthorized')
    expect(onAuthenticated).not.toHaveBeenCalled()
  })

  it('uses a retryable code when the resolver fails temporarily', async () => {
    const resolveUserId = vi.fn(async () => {
      throw new Error('database unavailable')
    })
    const { authentication, close } = createAuthentication(resolveUserId)

    await expect(authentication.authenticate({ token: 'valid-token' })).rejects.toThrow('database unavailable')
    expect(close).toHaveBeenCalledWith(WS_CLOSE_INTERNAL_ERROR, 'authentication unavailable')
  })
})
