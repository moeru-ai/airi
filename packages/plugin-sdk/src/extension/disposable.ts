/** The options of one cleanup run. */
export interface DisposeOptions {
  /**
   * The signal of the Host stop that runs this cleanup. The Host gives it to each plugin cleanup that it runs.
   * It aborts when the stop timeout passes, or when the Host stops waiting for another reason.
   * Pass it to `ctx.self.stop({ signal })`, so that a stop from this cleanup does not wait for the cleanup itself.
   */
  signal?: AbortSignal
}

/**
 * Describes a disposable runtime resource owned by an extension or module.
 */
export interface Disposable {
  /** Releases the resource. A Host cleanup passes `options` with its stop signal. */
  dispose: (options?: DisposeOptions) => void | Promise<void>
}

/**
 * Attempts resource disposal sequentially in reverse registration order, even when an entry fails.
 *
 * Each registered entry is attempted once. A single failure retains its identity, and multiple failures produce an AggregateError.
 * Repeated disposal is a no-op, including while disposal is pending.
 * Each entry gets the `options` of the disposal, so a Host cleanup gives its stop signal to each entry.
 *
 * Entries added after disposal starts run immediately with the same `options`. Their disposal is not joined to the pending operation, and an asynchronous failure of such an entry is dropped.
 */
export class DisposableStore implements Disposable {
  private readonly disposables: Disposable[] = []
  private disposed?: DisposeOptions

  add(disposable: Disposable) {
    if (this.disposed) {
      // Nothing waits for a late entry, so its failure has no caller. Without the handler, it is an unhandled rejection, which ends a plugin worker.
      void Promise.resolve(disposable.dispose(this.disposed)).catch(() => undefined)
      return disposable
    }

    this.disposables.push(disposable)
    return disposable
  }

  async dispose(options: DisposeOptions = {}) {
    if (this.disposed) {
      return
    }

    this.disposed = options
    const disposables = this.disposables.splice(0)
    const errors: unknown[] = []
    for (const disposable of disposables.reverse()) {
      try {
        await disposable.dispose(options)
      }
      catch (error) {
        errors.push(error)
      }
    }
    if (errors.length === 1) {
      throw errors[0]
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, 'Resource disposal failed.')
    }
  }
}
