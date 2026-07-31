import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDiscordInputQueue, DiscordInputAdmissionError, parseDiscordPrincipalId } from './discordInputQueue'

function principal(value: string) {
  const result = parseDiscordPrincipalId(value)
  if (!result)
    throw new Error(`Invalid test Discord principal: ${value}`)
  return result
}

function abortableBlockedRun(signal: AbortSignal) {
  return new Promise<void>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
}

function observeRejection(promise: Promise<void>) {
  void promise.catch(() => {})
  return promise
}

afterEach(() => {
  vi.useRealTimers()
})

describe('discord input queue', () => {
  it('rejects a third reservation for one exact session (CSR-09)', async () => {
    const queue = createDiscordInputQueue()
    const user = principal('123456789012345678')
    const first = observeRejection(queue.submit({ principalId: user, sessionId: 'discord-guild-1', run: abortableBlockedRun }))
    const second = observeRejection(queue.submit({ principalId: user, sessionId: 'discord-guild-1', run: abortableBlockedRun }))

    await expect(queue.submit({ principalId: user, sessionId: 'discord-guild-1', run: async () => {} }))
      .rejects
      .toMatchObject({ reason: 'session-capacity' })
    expect(queue.getSnapshot().sessions['discord-guild-1']).toBe(2)

    queue.shutdown()
    await expect(first).rejects.toThrow('shut down')
    await expect(second).rejects.toThrow('shut down')
  })

  it('shares one principal cap across DM and guild sessions (CSR-09)', async () => {
    const queue = createDiscordInputQueue()
    const user = principal('123456789012345678')
    const retained = [
      queue.submit({ principalId: user, sessionId: 'discord-dm-123456789012345678', run: abortableBlockedRun }),
      queue.submit({ principalId: user, sessionId: 'discord-dm-123456789012345678', run: abortableBlockedRun }),
      queue.submit({ principalId: user, sessionId: 'discord-guild-1', run: abortableBlockedRun }),
      queue.submit({ principalId: user, sessionId: 'discord-guild-2', run: abortableBlockedRun }),
    ].map(observeRejection)

    await expect(queue.submit({ principalId: user, sessionId: 'discord-guild-3', run: async () => {} }))
      .rejects
      .toMatchObject({ reason: 'principal-capacity' })
    expect(queue.getSnapshot().principals[user]).toBe(4)

    queue.shutdown()
    for (const submission of retained)
      await expect(submission).rejects.toThrow('shut down')
  })

  it('reserves capacity for another principal after one reaches its cap (CSR-09)', async () => {
    const queue = createDiscordInputQueue()
    const firstUser = principal('123456789012345678')
    const secondUser = principal('223456789012345678')
    const retained = Array.from({ length: 4 }, (_, index) => observeRejection(queue.submit({
      principalId: firstUser,
      sessionId: `discord-guild-${index + 1}`,
      run: abortableBlockedRun,
    })))
    const secondUserSubmission = observeRejection(queue.submit({
      principalId: secondUser,
      sessionId: 'discord-guild-5',
      run: abortableBlockedRun,
    }))

    expect(queue.getSnapshot().global).toBe(5)
    expect(queue.getSnapshot().principals[firstUser]).toBe(4)
    expect(queue.getSnapshot().principals[secondUser]).toBe(1)

    queue.shutdown()
    for (const submission of [...retained, secondUserSubmission])
      await expect(submission).rejects.toThrow('shut down')
  })

  it('enforces the global active-plus-queued cap (CSR-09)', async () => {
    const queue = createDiscordInputQueue({
      limits: {
        sessionCapacity: 3,
        principalCapacity: 3,
        globalCapacity: 4,
      },
    })
    const firstUser = principal('123456789012345678')
    const secondUser = principal('223456789012345678')
    const retained = [
      queue.submit({ principalId: firstUser, sessionId: 'a-1', run: abortableBlockedRun }),
      queue.submit({ principalId: firstUser, sessionId: 'a-2', run: abortableBlockedRun }),
      queue.submit({ principalId: firstUser, sessionId: 'a-3', run: abortableBlockedRun }),
      queue.submit({ principalId: secondUser, sessionId: 'b-1', run: abortableBlockedRun }),
    ].map(observeRejection)

    await expect(queue.submit({ principalId: secondUser, sessionId: 'b-2', run: async () => {} }))
      .rejects
      .toMatchObject({ reason: 'global-capacity' })
    expect(queue.getSnapshot().global).toBe(4)

    queue.shutdown()
    for (const submission of retained)
      await expect(submission).rejects.toThrow('shut down')
  })

  it('dispatches principals round-robin while preserving exact-session order (CSR-09)', async () => {
    const queue = createDiscordInputQueue()
    const firstUser = principal('123456789012345678')
    const secondUser = principal('223456789012345678')
    const dispatchOrder: string[] = []

    const submit = (principalId: typeof firstUser, sessionId: string, label: string) => queue.submit({
      principalId,
      sessionId,
      run: async () => {
        dispatchOrder.push(label)
      },
    })

    await Promise.all([
      submit(firstUser, 'a-session', 'a-1'),
      submit(firstUser, 'a-session', 'a-2'),
      submit(secondUser, 'b-session', 'b-1'),
      submit(secondUser, 'b-session', 'b-2'),
    ])

    expect(dispatchOrder).toEqual(['a-1', 'b-1', 'a-2', 'b-2'])
    expect(queue.getSnapshot().global).toBe(0)
  })

  it('releases a reservation after successful provider completion', async () => {
    const queue = createDiscordInputQueue()

    await queue.submit({
      principalId: principal('123456789012345678'),
      sessionId: 'success-session',
      run: async () => {},
    })

    expect(queue.getSnapshot().global).toBe(0)
  })

  it('releases a reservation after provider failure', async () => {
    const queue = createDiscordInputQueue()

    await expect(queue.submit({
      principalId: principal('123456789012345678'),
      sessionId: 'provider-failure-session',
      run: async () => {
        throw new Error('provider failed')
      },
    })).rejects.toThrow('provider failed')

    expect(queue.getSnapshot().global).toBe(0)
  })

  it('releases a reservation after preprocessing failure', async () => {
    const queue = createDiscordInputQueue()

    await expect(queue.submit({
      principalId: principal('123456789012345678'),
      sessionId: 'preprocessing-failure-session',
      run: async () => {
        throw new Error('preprocessing failed')
      },
    })).rejects.toThrow('preprocessing failed')

    expect(queue.getSnapshot().global).toBe(0)
  })

  it('releases active and queued reservations after cancellation', async () => {
    const queue = createDiscordInputQueue()
    const user = principal('123456789012345678')
    const first = observeRejection(queue.submit({ principalId: user, sessionId: 'cancel-session', run: abortableBlockedRun }))
    const second = observeRejection(queue.submit({ principalId: user, sessionId: 'cancel-session', run: abortableBlockedRun }))
    await vi.waitFor(() => expect(queue.getSnapshot().active).toBe(1))

    expect(queue.cancelSession('cancel-session')).toBe(2)
    await expect(first).rejects.toThrow('cancelled')
    await expect(second).rejects.toThrow('cancelled')
    expect(queue.getSnapshot().global).toBe(0)
  })

  // https://github.com/moeru-ai/airi/pull/2097
  it('continues dispatching after a cancelled operation never settles (CSR-09)', async () => {
    // ROOT CAUSE:
    //
    // Aborting the active reservation only notified its operation. If that
    // operation ignored the signal and never settled, drain() kept awaiting it
    // and no later Discord reservation could dispatch.
    //
    // Before the fix, nextRun remains queued forever after cancelSession().
    //
    // We fixed this by making cancellation settle the scheduler's wait without
    // requiring the underlying provider operation to cooperate.
    const queue = createDiscordInputQueue()
    const user = principal('123456789012345678')
    const neverSettles = new Promise<void>(() => {})
    const blocked = observeRejection(queue.submit({
      principalId: user,
      sessionId: 'cancelled-session',
      run: async () => neverSettles,
    }))
    const nextRun = vi.fn()
    const next = observeRejection(queue.submit({
      principalId: user,
      sessionId: 'next-session',
      run: async () => nextRun(),
    }))
    await vi.waitFor(() => expect(queue.getSnapshot().active).toBe(1))

    try {
      expect(queue.cancelSession('cancelled-session')).toBe(1)
      await vi.waitFor(() => expect(nextRun).toHaveBeenCalledTimes(1))
    }
    finally {
      queue.shutdown()
    }

    await expect(blocked).rejects.toThrow('cancelled')
    await expect(next).resolves.toBeUndefined()
    expect(queue.getSnapshot().global).toBe(0)
  })

  it('releases queued reservations when their wait times out', async () => {
    vi.useFakeTimers()
    const queue = createDiscordInputQueue({ limits: { queueTimeoutMs: 10 } })
    const firstUser = principal('123456789012345678')
    const secondUser = principal('223456789012345678')
    const first = observeRejection(queue.submit({ principalId: firstUser, sessionId: 'blocked-session', run: abortableBlockedRun }))
    const timedOut = observeRejection(queue.submit({ principalId: secondUser, sessionId: 'timeout-session', run: async () => {} }))
    await Promise.resolve()
    expect(queue.getSnapshot().active).toBe(1)

    await vi.advanceTimersByTimeAsync(11)

    await expect(timedOut).rejects.toThrow('expired before dispatch')
    expect(queue.getSnapshot().global).toBe(1)
    queue.shutdown()
    await expect(first).rejects.toThrow('shut down')
  })

  // https://github.com/moeru-ai/airi/pull/2097
  it('accepts new work after disconnect cancels an operation that never settles (CSR-09)', async () => {
    const queue = createDiscordInputQueue()
    const user = principal('123456789012345678')
    const activeRun = new Promise<void>(() => {})
    const activeSubmission = observeRejection(queue.submit({
      principalId: user,
      sessionId: 'disconnect-session',
      run: async () => activeRun,
    }))
    const queuedSubmission = observeRejection(queue.submit({
      principalId: user,
      sessionId: 'queued-session',
      run: async () => {},
    }))
    await vi.waitFor(() => expect(queue.getSnapshot().active).toBe(1))

    expect(queue.cancelAll(new Error('transport disconnected'))).toBe(2)
    await expect(queuedSubmission).rejects.toThrow('transport disconnected')
    await expect(activeSubmission).rejects.toThrow('transport disconnected')
    expect(queue.getSnapshot().global).toBe(0)

    await expect(queue.submit({
      principalId: user,
      sessionId: 'reconnected-session',
      run: async () => {},
    })).resolves.toBeUndefined()
    expect(queue.getSnapshot().global).toBe(0)
  })

  it('releases each reservation exactly once during runtime shutdown', async () => {
    const queue = createDiscordInputQueue()
    const user = principal('123456789012345678')
    let finishActive: () => void = () => {}
    const activeRun = new Promise<void>((resolve) => {
      finishActive = resolve
    })
    const activeSubmission = observeRejection(queue.submit({
      principalId: user,
      sessionId: 'active-session',
      run: async () => activeRun,
    }))
    const queuedSubmission = observeRejection(queue.submit({
      principalId: user,
      sessionId: 'queued-session',
      run: async () => {},
    }))
    await vi.waitFor(() => expect(queue.getSnapshot().active).toBe(1))

    queue.shutdown()
    await expect(activeSubmission).rejects.toThrow('shut down')
    await expect(queuedSubmission).rejects.toThrow('shut down')
    expect(queue.getSnapshot().global).toBe(0)

    finishActive()
    await Promise.resolve()
    expect(queue.getSnapshot()).toMatchObject({ active: 0, global: 0, principals: {}, sessions: {} })
  })

  it('fails closed for malformed Discord principal identity', () => {
    expect(parseDiscordPrincipalId(undefined)).toBeUndefined()
    expect(parseDiscordPrincipalId('display-name')).toBeUndefined()
    expect(parseDiscordPrincipalId('0')).toBeUndefined()
    expect(parseDiscordPrincipalId('18446744073709551616')).toBeUndefined()
    expect(parseDiscordPrincipalId('123456789012345678')).toBe('123456789012345678')
  })

  it('rejects contradictory or unsafe capacity configuration', () => {
    expect(() => createDiscordInputQueue({
      limits: { sessionCapacity: 5, principalCapacity: 4, globalCapacity: 8 },
    })).toThrow('sessionCapacity must not exceed principalCapacity')
    expect(() => createDiscordInputQueue({
      limits: { sessionCapacity: 2, principalCapacity: 8, globalCapacity: 8 },
    })).toThrow('principalCapacity must be strictly below globalCapacity')
    expect(() => createDiscordInputQueue({
      limits: { queueTimeoutMs: 0 },
    })).toThrow('queueTimeoutMs must be a positive safe integer')
  })

  it('does not retain work rejected by admission', async () => {
    const queue = createDiscordInputQueue()
    const user = principal('123456789012345678')
    const retained = [
      queue.submit({ principalId: user, sessionId: 'same-session', run: abortableBlockedRun }),
      queue.submit({ principalId: user, sessionId: 'same-session', run: abortableBlockedRun }),
    ].map(observeRejection)

    await expect(queue.submit({ principalId: user, sessionId: 'same-session', run: async () => {} }))
      .rejects
      .toBeInstanceOf(DiscordInputAdmissionError)
    expect(queue.getSnapshot().global).toBe(2)

    queue.shutdown()
    for (const submission of retained)
      await expect(submission).rejects.toThrow('shut down')
  })
})
