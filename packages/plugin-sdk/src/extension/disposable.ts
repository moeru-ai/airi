/**
 * Describes a disposable runtime resource owned by an extension or module.
 */
export interface Disposable {
  /** Releases the resource. */
  dispose: () => void | Promise<void>
}

/**
 * Stores disposable resources and releases them in reverse registration order.
 *
 * Use when:
 * - Extension setup needs to collect session-level cleanup callbacks
 * - Module registration needs scoped cleanup for watches, subscriptions, and bindings
 *
 * Expects:
 * - Disposables are independent or tolerate reverse-order teardown
 *
 * Returns:
 * - A disposable store that attempts every cleanup before reporting failures
 */
export class DisposableStore implements Disposable {
  private readonly disposables: Disposable[] = []
  private disposed = false

  add(disposable: Disposable) {
    if (this.disposed) {
      void disposable.dispose()
      return disposable
    }

    this.disposables.push(disposable)
    return disposable
  }

  async dispose() {
    if (this.disposed) {
      return
    }

    this.disposed = true
    const errors: unknown[] = []
    for (const disposable of [...this.disposables].reverse()) {
      try {
        await disposable.dispose()
      }
      catch (error) {
        errors.push(error)
      }
    }
    this.disposables.length = 0

    if (errors.length === 1) {
      throw errors[0]
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, 'Multiple disposable resources failed to clean up.')
    }
  }
}
