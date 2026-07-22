const MAX_DISCORD_SNOWFLAKE = (1n << 64n) - 1n

declare const discordPrincipalIdBrand: unique symbol

/** A syntactically valid, non-zero Discord user snowflake. */
export type DiscordPrincipalId = string & { readonly [discordPrincipalIdBrand]: true }

/** Deterministic reason why a Discord reservation was not admitted. */
export type DiscordInputAdmissionRejection
  = | 'global-capacity'
    | 'principal-capacity'
    | 'session-capacity'
    | 'shutdown'

/** Capacity and wait policy for one Stage runtime's Discord input queue. */
export interface DiscordInputQueueLimits {
  /** Maximum retained work for one exact chat session. @default 2 */
  sessionCapacity: number
  /** Maximum retained work for one Discord user across all sessions. @default 4 */
  principalCapacity: number
  /** Maximum retained Discord work across this Stage runtime. @default 8 */
  globalCapacity: number
  /** Maximum time queued work may wait before dispatch, in milliseconds. @default 30000 */
  queueTimeoutMs: number
}

/** Work accepted from the Discord-specific `input:text` boundary. */
export interface DiscordInputWork {
  /** Stable Discord user snowflake validated by {@link parseDiscordPrincipalId}. */
  principalId: DiscordPrincipalId
  /** Canonical chat session selected by the current context-bridge policy. */
  sessionId: string
  /** Runs only after principal-fair dispatch selects this reservation. */
  run: (signal: AbortSignal) => Promise<void>
}

/** Read-only reservation counts used for diagnostics and security regression tests. */
export interface DiscordInputQueueSnapshot {
  /** Number of admitted reservations currently dispatching. */
  active: number
  /** Total admitted active plus queued reservations. */
  global: number
  /** Active plus queued reservation counts keyed by Discord user ID. */
  principals: Record<string, number>
  /** Active plus queued reservation counts keyed by exact chat session. */
  sessions: Record<string, number>
  /** Whether this runtime has permanently stopped accepting work. */
  shutdown: boolean
}

/** Error returned when atomic admission rejects work before retaining it. */
export class DiscordInputAdmissionError extends Error {
  constructor(public readonly reason: DiscordInputAdmissionRejection) {
    super(`Discord input rejected: ${reason}`)
    this.name = 'DiscordInputAdmissionError'
  }
}

interface Deferred {
  resolve: () => void
  reject: (error: unknown) => void
}

interface Reservation extends DiscordInputWork {
  controller: AbortController
  deferred: Deferred
  released: boolean
  settled: boolean
  timeout: ReturnType<typeof setTimeout>
}

const defaultLimits: DiscordInputQueueLimits = {
  sessionCapacity: 2,
  principalCapacity: 4,
  globalCapacity: 8,
  queueTimeoutMs: 30_000,
}

function assertPositiveInteger(name: keyof DiscordInputQueueLimits, value: number) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`${name} must be a positive safe integer`)
}

function resolveLimits(overrides: Partial<DiscordInputQueueLimits> | undefined): DiscordInputQueueLimits {
  const limits = {
    ...defaultLimits,
    ...overrides,
  }

  for (const [name, value] of Object.entries(limits) as Array<[keyof DiscordInputQueueLimits, number]>)
    assertPositiveInteger(name, value)

  if (limits.sessionCapacity > limits.principalCapacity)
    throw new RangeError('sessionCapacity must not exceed principalCapacity')
  if (limits.principalCapacity >= limits.globalCapacity)
    throw new RangeError('principalCapacity must be strictly below globalCapacity')

  return limits
}

/**
 * Parses an untrusted Discord user ID without falling back to display, channel,
 * guild, or session identity. Discord snowflakes are non-zero unsigned 64-bit
 * integers, represented as decimal strings at the protocol boundary.
 */
export function parseDiscordPrincipalId(value: unknown): DiscordPrincipalId | undefined {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))
    return undefined

  try {
    if (BigInt(value) > MAX_DISCORD_SNOWFLAKE)
      return undefined
  }
  catch {
    return undefined
  }

  return value as DiscordPrincipalId
}

/**
 * Creates the bounded, principal-fair admission boundary for Discord input.
 * Admission and all three capacity increments happen synchronously, before the
 * returned promise can enter a Web Lock or the chat orchestrator's FIFO.
 */
export function createDiscordInputQueue(options?: {
  limits?: Partial<DiscordInputQueueLimits>
}) {
  const limits = resolveLimits(options?.limits)
  const queuesByPrincipal = new Map<DiscordPrincipalId, Reservation[]>()
  const readyPrincipals: DiscordPrincipalId[] = []
  const readyPrincipalSet = new Set<DiscordPrincipalId>()
  const principalCounts = new Map<DiscordPrincipalId, number>()
  const sessionCounts = new Map<string, number>()

  let active: Reservation | undefined
  let draining = false
  let globalCount = 0
  let shutdown = false

  function settle(reservation: Reservation, error?: unknown) {
    if (reservation.settled)
      return
    reservation.settled = true
    if (error === undefined)
      reservation.deferred.resolve()
    else
      reservation.deferred.reject(error)
  }

  function release(reservation: Reservation) {
    if (reservation.released)
      return
    reservation.released = true
    clearTimeout(reservation.timeout)

    globalCount -= 1

    const principalCount = (principalCounts.get(reservation.principalId) ?? 1) - 1
    if (principalCount === 0)
      principalCounts.delete(reservation.principalId)
    else
      principalCounts.set(reservation.principalId, principalCount)

    const sessionCount = (sessionCounts.get(reservation.sessionId) ?? 1) - 1
    if (sessionCount === 0)
      sessionCounts.delete(reservation.sessionId)
    else
      sessionCounts.set(reservation.sessionId, sessionCount)
  }

  function removeReadyPrincipal(principalId: DiscordPrincipalId) {
    readyPrincipalSet.delete(principalId)
    const index = readyPrincipals.indexOf(principalId)
    if (index >= 0)
      readyPrincipals.splice(index, 1)
  }

  function markPrincipalReady(principalId: DiscordPrincipalId) {
    if (readyPrincipalSet.has(principalId))
      return
    if (!(queuesByPrincipal.get(principalId)?.length))
      return
    if (active?.principalId === principalId)
      return

    readyPrincipalSet.add(principalId)
    readyPrincipals.push(principalId)
  }

  function removeQueuedReservation(reservation: Reservation) {
    const queue = queuesByPrincipal.get(reservation.principalId)
    if (!queue)
      return false

    const index = queue.indexOf(reservation)
    if (index < 0)
      return false

    queue.splice(index, 1)
    if (queue.length === 0) {
      queuesByPrincipal.delete(reservation.principalId)
      removeReadyPrincipal(reservation.principalId)
    }
    return true
  }

  function rejectQueuedReservation(reservation: Reservation, error: Error) {
    if (!removeQueuedReservation(reservation))
      return false
    reservation.controller.abort(error)
    release(reservation)
    settle(reservation, error)
    return true
  }

  function dequeueNext() {
    const principalId = readyPrincipals.shift()
    if (!principalId)
      return undefined

    readyPrincipalSet.delete(principalId)
    const queue = queuesByPrincipal.get(principalId)
    const reservation = queue?.shift()
    if (!queue || !reservation)
      return undefined

    if (queue.length === 0)
      queuesByPrincipal.delete(principalId)

    return reservation
  }

  async function drain() {
    if (draining)
      return
    draining = true

    try {
      while (true) {
        if (shutdown)
          return

        const reservation = dequeueNext()
        if (!reservation)
          return

        active = reservation
        clearTimeout(reservation.timeout)

        try {
          await reservation.run(reservation.controller.signal)
          settle(reservation)
        }
        catch (error) {
          settle(reservation, error)
        }
        finally {
          release(reservation)
          active = undefined
          markPrincipalReady(reservation.principalId)
        }
      }
    }
    finally {
      draining = false
    }
  }

  function scheduleDrain() {
    queueMicrotask(() => void drain())
  }

  function submit(work: DiscordInputWork): Promise<void> {
    if (shutdown)
      return Promise.reject(new DiscordInputAdmissionError('shutdown'))

    const sessionCount = sessionCounts.get(work.sessionId) ?? 0
    if (sessionCount >= limits.sessionCapacity)
      return Promise.reject(new DiscordInputAdmissionError('session-capacity'))

    const principalCount = principalCounts.get(work.principalId) ?? 0
    if (principalCount >= limits.principalCapacity)
      return Promise.reject(new DiscordInputAdmissionError('principal-capacity'))

    if (globalCount >= limits.globalCapacity)
      return Promise.reject(new DiscordInputAdmissionError('global-capacity'))

    let deferred: Deferred = {
      resolve: () => {},
      reject: () => {},
    }
    const result = new Promise<void>((resolve, reject) => {
      deferred = { resolve, reject }
    })

    const reservation: Reservation = {
      ...work,
      controller: new AbortController(),
      deferred,
      released: false,
      settled: false,
      timeout: setTimeout(() => {
        rejectQueuedReservation(reservation, new Error('Discord input expired before dispatch'))
      }, limits.queueTimeoutMs),
    }

    // JavaScript execution is run-to-completion: checking every applicable
    // limit and incrementing all ownership counters here forms one atomic
    // admission decision before any async work can retain the reservation.
    globalCount += 1
    principalCounts.set(work.principalId, principalCount + 1)
    sessionCounts.set(work.sessionId, sessionCount + 1)

    const principalQueue = queuesByPrincipal.get(work.principalId) ?? []
    principalQueue.push(reservation)
    queuesByPrincipal.set(work.principalId, principalQueue)
    markPrincipalReady(work.principalId)
    scheduleDrain()

    return result
  }

  function cancelQueued(where: (reservation: Reservation) => boolean, error: Error) {
    let cancelled = 0

    for (const queue of queuesByPrincipal.values()) {
      // Filtering creates a stable cancellation set because rejecting a
      // reservation removes it from this queue and may delete its map entry.
      for (const reservation of queue.filter(where)) {
        if (rejectQueuedReservation(reservation, error))
          cancelled += 1
      }
    }

    return cancelled
  }

  function cancelSession(sessionId: string, error = new Error('Discord input session cancelled')) {
    let cancelled = cancelQueued(reservation => reservation.sessionId === sessionId, error)

    if (active?.sessionId === sessionId && !active.controller.signal.aborted) {
      active.controller.abort(error)
      cancelled += 1
    }

    return cancelled
  }

  function cancelAll(error = new Error('Discord input cancelled')) {
    let cancelled = cancelQueued(() => true, error)

    if (active && !active.controller.signal.aborted) {
      active.controller.abort(error)
      cancelled += 1
    }

    return cancelled
  }

  function stop(error = new Error('Discord input queue shut down')) {
    if (shutdown)
      return
    shutdown = true
    cancelAll(error)

    // A shutting-down runtime cannot admit replacement work. Release its
    // active reservation immediately; the task's eventual finally path is
    // guarded so ownership is still released exactly once.
    if (active) {
      release(active)
      settle(active, error)
    }
  }

  function getSnapshot(): DiscordInputQueueSnapshot {
    return {
      active: active && !active.released ? 1 : 0,
      global: globalCount,
      principals: Object.fromEntries(principalCounts),
      sessions: Object.fromEntries(sessionCounts),
      shutdown,
    }
  }

  return {
    submit,
    cancelSession,
    cancelAll,
    shutdown: stop,
    getSnapshot,
  }
}
