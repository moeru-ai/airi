/**
 * Describes a disposable runtime resource owned by an extension or module.
 */
export interface Disposable {
  /** Releases the resource. */
  dispose: () => void | Promise<void>
}

/**
 * Attempts resource disposal sequentially in reverse registration order, even when an entry fails.
 *
 * Each registered entry is attempted once. A single failure retains its identity, and multiple failures produce an AggregateError.
 * Repeated disposal is a no-op, including while disposal is pending.
 *
 * Entries added after disposal starts run immediately. Their disposal is not joined to the pending operation.
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
    const disposables = this.disposables.splice(0)
    const errors: unknown[] = []
    for (const disposable of disposables.reverse()) {
      try {
        await disposable.dispose()
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
