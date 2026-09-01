/** A session returned by an extension host start operation. */
export interface ExtensionLifecycleSession {
  id: string
}

/** Callbacks that connect the lifecycle policy to one official extension host. */
export interface ExtensionLifecycleOptions<TSession extends ExtensionLifecycleSession> {
  start: () => Promise<TSession>
  stop: (sessionId: string) => Promise<void>
  synchronize: () => Promise<void>
  clear: () => void
}

/** Lifecycle controls for one official extension host. */
export interface ExtensionLifecycle {
  start: () => Promise<void>
  stop: () => Promise<void>
}

/**
 * Creates a race-safe lifecycle for one official extension host.
 *
 * A stop request invalidates the current start generation. The lifecycle
 * waits for that start to finish, then closes any session that it created.
 * A failed start clears the cached promise so the next start can retry.
 */
export function createExtensionLifecycle<TSession extends ExtensionLifecycleSession>(
  options: ExtensionLifecycleOptions<TSession>,
): ExtensionLifecycle {
  let activeSessionId: string | undefined
  let startPromise: Promise<void> | undefined
  let stopPromise: Promise<void> | undefined
  let generation = 0

  const start = () => {
    if (startPromise) {
      return startPromise
    }

    const startGeneration = generation
    const pendingStop = stopPromise
    const nextStart = (async () => {
      if (pendingStop) {
        await pendingStop
      }

      let startedSessionId: string | undefined
      try {
        const session = await options.start()
        startedSessionId = session.id

        if (startGeneration !== generation) {
          await options.stop(session.id)
          return
        }

        activeSessionId = session.id
        await options.synchronize()

        if (startGeneration !== generation) {
          const staleSessionId = activeSessionId
          activeSessionId = undefined
          if (staleSessionId) {
            await options.stop(staleSessionId)
          }
          options.clear()
        }
      }
      catch (error) {
        if (startedSessionId && activeSessionId === startedSessionId) {
          activeSessionId = undefined
          await options.stop(startedSessionId).catch(() => {})
          options.clear()
        }
        throw error
      }
    })()

    startPromise = nextStart
    void nextStart.catch(() => {
      if (startPromise === nextStart) {
        startPromise = undefined
      }
    })
    return nextStart
  }

  const stop = () => {
    generation += 1
    const pendingStart = startPromise
    startPromise = undefined
    const previousStop = stopPromise
    const nextStop = (async () => {
      if (previousStop) {
        await previousStop
      }
      await pendingStart?.catch(() => {})

      const sessionId = activeSessionId
      activeSessionId = undefined
      try {
        if (sessionId) {
          await options.stop(sessionId)
        }
      }
      finally {
        options.clear()
      }
    })()

    stopPromise = nextStop
    void nextStop.then(
      () => {
        if (stopPromise === nextStop) {
          stopPromise = undefined
        }
      },
      () => {
        if (stopPromise === nextStop) {
          stopPromise = undefined
        }
      },
    )
    return nextStop
  }

  return { start, stop }
}
