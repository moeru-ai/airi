import type { MotionIntent, MotionLease, MotionPort } from './motion-adapter'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GameMotionAdapter } from './motion-adapter'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function intent(revision: number, sessionId = 1, name: MotionIntent['name'] = 'wave'): MotionIntent {
  return { sessionId, revision, name }
}

function lease() {
  const owner = new AbortController()
  const completion = deferred<void>()
  const play = vi.fn<MotionLease['play']>(() => completion.promise)
  const release = vi.fn<MotionLease['release']>()
  return { signal: owner.signal, owner, completion, play, release }
}

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('game motion adapter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('reserves user-game priority between gestures and releases it only at session exit', async () => {
    const owned = lease()
    const sessionChanged = vi.fn<MotionPort['sessionChanged']>()
    const adapter = new GameMotionAdapter({ sessionChanged, acquire: () => owned })
    adapter.setSession(1)
    adapter.submit(intent(1))
    await settle()
    owned.completion.resolve()
    await settle()
    expect(owned.release).toHaveBeenCalledTimes(1)
    expect(sessionChanged.mock.calls).toEqual([[1]])
    adapter.cancel()
    expect(sessionChanged.mock.calls).toEqual([[1]])
    adapter.setSession(null)
    expect(sessionChanged.mock.calls).toEqual([[1], [null]])
    adapter.dispose()
    expect(sessionChanged).toHaveBeenCalledTimes(2)
  })

  it('cannot play when session reservation fails', async () => {
    const acquire = vi.fn<MotionPort['acquire']>()
    const adapter = new GameMotionAdapter({
      sessionChanged: () => { throw new Error('Reservation failed') },
      acquire,
    })
    adapter.submit(intent(1))
    await settle()
    expect(acquire).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('still releases a reservation when its callback throws after changing ownership', () => {
    const sessionChanged = vi.fn<MotionPort['sessionChanged']>((sessionId) => {
      if (sessionId !== null)
        throw new Error('Failed after reservation')
    })
    const acquire = vi.fn<MotionPort['acquire']>()
    const adapter = new GameMotionAdapter({ sessionChanged, acquire })
    adapter.submit(intent(1))
    expect(acquire).not.toHaveBeenCalled()
    adapter.dispose()
    expect(sessionChanged.mock.calls).toEqual([[1], [null]])
  })

  it('does no work without an explicit port', () => {
    const adapter = new GameMotionAdapter()
    adapter.submit(intent(1))
    adapter.cancel()
    adapter.dispose()

    expect(vi.getTimerCount()).toBe(0)
  })

  it('acquires ownership before motion and releases it after completion', async () => {
    const owned = lease()
    const acquisition = deferred<MotionLease | undefined>()
    const acquire = vi.fn<MotionPort['acquire']>(() => acquisition.promise)
    const adapter = new GameMotionAdapter({ sessionChanged: () => {}, acquire })
    const submitted = intent(1, 1, 'celebrate')

    adapter.submit(submitted)
    expect(acquire).toHaveBeenCalledExactlyOnceWith(submitted, expect.any(AbortSignal))
    expect(owned.play).not.toHaveBeenCalled()

    acquisition.resolve(owned)
    await settle()
    const signal = acquire.mock.calls[0]![1]
    expect(owned.play).toHaveBeenCalledExactlyOnceWith(submitted, signal)
    expect(signal.aborted).toBe(false)

    owned.completion.resolve()
    await settle()
    expect(owned.release).toHaveBeenCalledTimes(1)
    expect(signal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('respects refusal without retries', async () => {
    const acquire = vi.fn<MotionPort['acquire']>(() => undefined)
    const adapter = new GameMotionAdapter({ sessionChanged: () => {}, acquire })
    adapter.submit(intent(1))
    await settle()
    await vi.advanceTimersByTimeAsync(10000)
    adapter.cancel()

    expect(acquire).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('releases a lease that arrives after cancellation without playing it', async () => {
    const owned = lease()
    const acquisition = deferred<MotionLease | undefined>()
    const acquire = vi.fn<MotionPort['acquire']>(() => acquisition.promise)
    const adapter = new GameMotionAdapter({ sessionChanged: () => {}, acquire })
    adapter.submit(intent(1))
    adapter.cancel()
    expect(acquire.mock.calls[0]![1].aborted).toBe(true)

    acquisition.resolve(owned)
    await settle()
    expect(owned.play).not.toHaveBeenCalled()
    expect(owned.release).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps only the latest submission while a stale acquisition remains unresolved', async () => {
    const stale = lease()
    const current = lease()
    const acquisition = deferred<MotionLease | undefined>()
    const acquire = vi.fn<MotionPort['acquire']>()
      .mockReturnValueOnce(acquisition.promise)
      .mockReturnValue(current)
    const adapter = new GameMotionAdapter({ sessionChanged: () => {}, acquire })
    adapter.submit(intent(1))
    for (let revision = 2; revision <= 1000; revision++)
      adapter.submit(intent(revision))

    expect(acquire).toHaveBeenCalledTimes(1)
    expect(acquire.mock.calls[0]![1].aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    acquisition.resolve(stale)
    await settle()

    expect(stale.play).not.toHaveBeenCalled()
    expect(stale.release).toHaveBeenCalledTimes(1)
    expect(acquire).toHaveBeenCalledTimes(2)
    expect(current.play).toHaveBeenCalledExactlyOnceWith(intent(1000), expect.any(AbortSignal))
    adapter.dispose()
  })

  it.each(['pause', 'replay', 'restart', 'model switch'])('discards pending gestures on %s', async () => {
    const owned = lease()
    const acquire = vi.fn<MotionPort['acquire']>(() => owned)
    const adapter = new GameMotionAdapter({ sessionChanged: () => {}, acquire })
    adapter.submit(intent(1))
    await settle()
    adapter.submit(intent(2))
    adapter.cancel()
    owned.completion.resolve()
    await settle()

    expect(acquire).toHaveBeenCalledTimes(1)
    expect(owned.play).toHaveBeenCalledTimes(1)
    expect(owned.release).toHaveBeenCalledTimes(1)
    expect(owned.play.mock.calls[0]![1].aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects old sessions, old revisions, and duplicate submissions after cancel', async () => {
    const owned = lease()
    const acquire = vi.fn<MotionPort['acquire']>(() => owned)
    const adapter = new GameMotionAdapter({ sessionChanged: () => {}, acquire })
    adapter.submit(intent(5, 2))
    await settle()
    adapter.cancel()
    adapter.submit(intent(100, 1))
    adapter.submit(intent(4, 2))
    adapter.submit(intent(5, 2))
    owned.completion.resolve()
    await settle()

    expect(acquire).toHaveBeenCalledTimes(1)
    expect(owned.release).toHaveBeenCalledTimes(1)
  })

  it('accepts a new session with a reset revision after stale playback ends', async () => {
    const oldModel = lease()
    const newModel = lease()
    const acquire = vi.fn<MotionPort['acquire']>()
      .mockReturnValueOnce(oldModel)
      .mockReturnValue(newModel)
    const adapter = new GameMotionAdapter({ sessionChanged: () => {}, acquire })
    adapter.submit(intent(10, 1))
    await settle()
    adapter.cancel()
    adapter.submit(intent(0, 2, 'bow'))
    oldModel.completion.resolve()
    await settle()

    expect(oldModel.release).toHaveBeenCalledTimes(1)
    expect(newModel.play).toHaveBeenCalledExactlyOnceWith(intent(0, 2, 'bow'), expect.any(AbortSignal))
    expect(newModel.release).not.toHaveBeenCalled()
    expect(newModel.play.mock.calls[0]![1].aborted).toBe(false)
    adapter.dispose()
  })

  it('stops its own lease when emergency stop or direct manipulation revoke ownership', async () => {
    const owned = lease()
    const acquire = vi.fn<MotionPort['acquire']>(() => owned)
    const adapter = new GameMotionAdapter({ sessionChanged: () => {}, acquire })
    adapter.submit(intent(1))
    await settle()
    owned.owner.abort()

    expect(owned.play.mock.calls[0]![1].aborted).toBe(true)
    expect(owned.release).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    owned.completion.resolve()
    await settle()
    expect(acquire).toHaveBeenCalledTimes(1)
    expect(owned.release).toHaveBeenCalledTimes(1)
  })

  it('never plays an already revoked lease', async () => {
    const owned = lease()
    owned.owner.abort()
    const adapter = new GameMotionAdapter({ sessionChanged: () => {}, acquire: () => owned })
    adapter.submit(intent(1))
    await settle()

    expect(owned.play).not.toHaveBeenCalled()
    expect(owned.release).toHaveBeenCalledTimes(1)
  })

  it('bounds acquisition ownership by time and cleans up a late result', async () => {
    const owned = lease()
    const acquisition = deferred<MotionLease | undefined>()
    const acquire = vi.fn<MotionPort['acquire']>(() => acquisition.promise)
    const adapter = new GameMotionAdapter({ sessionChanged: () => {}, acquire })
    adapter.submit(intent(1))
    await vi.advanceTimersByTimeAsync(5000)

    expect(acquire.mock.calls[0]![1].aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    acquisition.resolve(owned)
    await settle()
    expect(owned.play).not.toHaveBeenCalled()
    expect(owned.release).toHaveBeenCalledTimes(1)
  })

  it('stops a gesture at its deadline even when its promise ignores cancellation', async () => {
    const owned = lease()
    const acquire = vi.fn<MotionPort['acquire']>(() => owned)
    const adapter = new GameMotionAdapter({ sessionChanged: () => {}, acquire })
    adapter.submit(intent(1))
    await settle()
    await vi.advanceTimersByTimeAsync(4999)
    expect(owned.release).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(owned.play.mock.calls[0]![1].aborted).toBe(true)
    expect(owned.release).toHaveBeenCalledTimes(1)
    expect(acquire).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    adapter.dispose()
  })

  it('permanently rejects work after disposal, including stale acquisition results', async () => {
    const owned = lease()
    const acquisition = deferred<MotionLease | undefined>()
    const acquire = vi.fn<MotionPort['acquire']>(() => acquisition.promise)
    const adapter = new GameMotionAdapter({ sessionChanged: () => {}, acquire })
    adapter.submit(intent(1))
    adapter.submit(intent(2))
    adapter.dispose()
    adapter.dispose()
    adapter.submit(intent(3))
    acquisition.resolve(owned)
    await settle()

    expect(acquire).toHaveBeenCalledTimes(1)
    expect(owned.play).not.toHaveBeenCalled()
    expect(owned.release).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('contains synchronous acquisition errors and accepts later intents', async () => {
    const owned = lease()
    const acquire = vi.fn<MotionPort['acquire']>()
      .mockImplementationOnce(() => { throw new Error('Unavailable model') })
      .mockReturnValue(owned)
    const adapter = new GameMotionAdapter({ sessionChanged: () => {}, acquire })
    expect(() => adapter.submit(intent(1))).not.toThrow()
    await settle()
    adapter.submit(intent(2))
    await settle()

    expect(owned.play).toHaveBeenCalledExactlyOnceWith(intent(2), expect.any(AbortSignal))
    adapter.dispose()
  })

  it('contains rejected acquisition promises and starts only the latest intent', async () => {
    const owned = lease()
    const acquisition = deferred<MotionLease | undefined>()
    const acquire = vi.fn<MotionPort['acquire']>()
      .mockReturnValueOnce(acquisition.promise)
      .mockReturnValue(owned)
    const adapter = new GameMotionAdapter({ sessionChanged: () => {}, acquire })
    adapter.submit(intent(1))
    adapter.submit(intent(2))
    acquisition.reject(new Error('Ownership refused'))
    await settle()

    expect(owned.play).toHaveBeenCalledExactlyOnceWith(intent(2), expect.any(AbortSignal))
    adapter.dispose()
  })

  it.each(['throw', 'reject'])('releases the lease when play fails through %s', async (failure) => {
    const owned = lease()
    owned.play.mockImplementation(() => {
      if (failure === 'throw')
        throw new Error('Motion failed')
      return Promise.reject(new Error('Motion failed'))
    })
    const adapter = new GameMotionAdapter({ sessionChanged: () => {}, acquire: () => owned })
    adapter.submit(intent(1))
    await settle()

    expect(owned.release).toHaveBeenCalledTimes(1)
    expect(owned.play.mock.calls[0]![1].aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts before release and contains release errors without retries', async () => {
    const owned = lease()
    const acquire = vi.fn<MotionPort['acquire']>(() => owned)
    const observeRelease = vi.fn<(aborted: boolean) => void>()
    owned.release.mockImplementation(() => {
      observeRelease(acquire.mock.calls[0]![1].aborted)
      throw new Error('Release failed')
    })
    const adapter = new GameMotionAdapter({ sessionChanged: () => {}, acquire })
    adapter.submit(intent(1))
    await settle()
    expect(() => adapter.cancel()).not.toThrow()
    owned.completion.reject(new Error('Cancelled motion'))
    await settle()
    adapter.dispose()

    expect(observeRelease).toHaveBeenCalledExactlyOnceWith(true)
    expect(owned.release).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('snapshots host intents before an asynchronous acquisition', async () => {
    const owned = lease()
    const acquisition = deferred<MotionLease | undefined>()
    const adapter = new GameMotionAdapter({ sessionChanged: () => {}, acquire: () => acquisition.promise })
    const submitted = { sessionId: 1, revision: 1, name: 'wave' } as const
    const mutable = { ...submitted }
    adapter.submit(mutable)
    Object.assign(mutable, { sessionId: 9, revision: 9, name: 'bow' })
    acquisition.resolve(owned)
    await settle()

    expect(owned.play).toHaveBeenCalledExactlyOnceWith(submitted, expect.any(AbortSignal))
    adapter.dispose()
  })

  it.each([
    { sessionId: -1, revision: 1 },
    { sessionId: Number.NaN, revision: 1 },
    { sessionId: 1, revision: Number.POSITIVE_INFINITY },
    { sessionId: 1, revision: 0.5 },
    { sessionId: 1, revision: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects invalid correlation values: %j', (correlation) => {
    const acquire = vi.fn<MotionPort['acquire']>()
    const adapter = new GameMotionAdapter({ sessionChanged: () => {}, acquire })
    adapter.submit({ ...correlation, name: 'wave' })

    expect(acquire).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
