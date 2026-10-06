/**
 * One owned lifetime.
 *
 * `signal` aborts when the scope closes, either through `close` or through its parent signal.
 * Deferred cleanups run once, in reverse registration order, after the signal aborts.
 */
export interface Scope {
  readonly signal: AbortSignal
  /** Resolves after every deferred cleanup has settled. Cleanup errors are reported, not thrown. */
  readonly closed: Promise<void>
  /** Registers cleanup. A cleanup registered after closing runs immediately. */
  defer: (cleanup: () => unknown) => void
  /**
   * Creates a scope that closes with this one, and can also close earlier by itself.
   * Children start closing before the parent's own cleanups. The parent does not await child cleanup.
   */
  child: () => Scope
  close: (reason?: unknown) => Promise<void>
}

/**
 * Creates a scope that closes when `parent` aborts.
 *
 * @example
 * const scope = createScope(options.signal)
 * scope.defer(() => track.stop())
 * await scope.close('Recording finished')
 */
export function createScope(parent?: AbortSignal, onCleanupError: (error: unknown) => void = console.error): Scope {
  const controller = new AbortController()
  const cleanups: (() => unknown)[] = []
  const settled = Promise.withResolvers<void>()

  async function runCleanups() {
    for (const cleanup of cleanups.splice(0).reverse()) {
      try {
        await cleanup()
      }
      catch (error) {
        onCleanupError(error)
      }
    }
    settled.resolve()
  }

  function close(reason?: unknown) {
    if (!controller.signal.aborted) {
      controller.abort(reason)
      void runCleanups()
    }
    return settled.promise
  }

  // The listener is removed automatically when this scope aborts first.
  parent?.addEventListener('abort', () => void close(parent.reason), { once: true, signal: controller.signal })
  if (parent?.aborted)
    void close(parent.reason)

  const scope: Scope = {
    signal: controller.signal,
    closed: settled.promise,
    defer(cleanup) {
      if (controller.signal.aborted)
        void Promise.resolve().then(cleanup).catch(onCleanupError)
      else
        cleanups.push(cleanup)
    },
    child() {
      return createScope(controller.signal, onCleanupError)
    },
    close,
  }
  return scope
}
