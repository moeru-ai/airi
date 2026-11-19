import type { WatchSource } from 'vue'

import { useDocumentVisibility, useIntervalFn, useOnline, useWindowFocus, watchDebounced } from '@vueuse/core'
import { watch } from 'vue'

export interface SyncRunnerOptions {
  /**
   * Waits before each automatic run after a failed run. The last value repeats until a run succeeds.
   *
   * @default [30_000, 120_000, 600_000]
   */
  retryDelaysMs?: readonly number[]
  /** Receives the error of each failed run. `request` never rejects, so this is the only report. */
  onError?: (error: unknown) => void
}

/**
 * Runs one synchronization at a time and repeats a failed run until one succeeds.
 *
 * A run must compare the current local and remote state, and must not depend on the
 * result of an earlier run. Then a failed run loses nothing, and the next run repairs it.
 *
 * Use when:
 * - A feature exchanges its state with a server after local changes and on background events.
 *
 * Expects:
 * - Only one context owns the runner. With `pinia-plugin-synced`, call `request` from a
 *   leader-routed action, and call that action from {@link watchSyncTriggers}.
 * - The owner calls `dispose` when its scope ends. An in-flight run finishes, and no later run starts.
 */
export class SyncRunner {
  private active: Promise<void> | undefined
  private hasQueuedRun = false
  private failures = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private disposed = false

  constructor(
    private readonly run: () => Promise<void>,
    private readonly options: SyncRunnerOptions = {},
  ) {}

  /** Starts a run. During a run, queues one more run and returns the promise of the active runs. */
  request(): Promise<void> {
    if (this.disposed)
      return Promise.resolve()

    if (this.active) {
      this.hasQueuedRun = true
      return this.active
    }

    this.clearRetry()
    this.active = this.drain()
    return this.active
  }

  dispose() {
    this.disposed = true
    this.clearRetry()
  }

  private async drain() {
    do {
      this.hasQueuedRun = false
      try {
        await this.run()
        this.failures = 0
      }
      catch (error) {
        this.failures++
        this.options.onError?.(error)
      }
    } while (this.hasQueuedRun && !this.disposed)

    // Clear this in the same task as the loop check. A later request then starts a new run and is not lost.
    this.active = undefined
    if (this.failures > 0)
      this.scheduleRetry()
  }

  private scheduleRetry() {
    if (this.disposed)
      return

    const delays = this.options.retryDelaysMs ?? [30_000, 120_000, 600_000]
    const delay = delays[Math.min(this.failures, delays.length) - 1]
    if (delay === undefined)
      return

    this.clearRetry()
    this.retryTimer = setTimeout(() => void this.request(), delay)
  }

  private clearRetry() {
    clearTimeout(this.retryTimer)
    this.retryTimer = undefined
  }
}

export interface SyncTriggerOptions {
  /** A change of any source requests a run, for example the account or a feature flag. */
  sources?: WatchSource[]
  /** A deep change of this source requests a run after `changesDebounceMs`. */
  changes?: WatchSource
  /** @default 1500 */
  changesDebounceMs?: number
  /** Also requests a run at this interval, for state that only another device changes. */
  pollIntervalMs?: number
}

/**
 * Requests a synchronization on the events after which the state can differ. Call it in an effect scope.
 * The scope owns the listeners. `request` must catch its errors.
 *
 * NOTICE:
 * A desktop window stays visible while the user works in another window, so it does not report a
 * visibility change. The focus event covers this case. Mobile WebViews report visibility.
 */
export function watchSyncTriggers(request: () => Promise<void>, options: SyncTriggerOptions = {}) {
  const requestOnEntry = (active: boolean) => {
    if (active)
      void request()
  }

  for (const source of options.sources ?? [])
    watch(source, () => void request())

  if (options.changes)
    watchDebounced(options.changes, () => void request(), { debounce: options.changesDebounceMs ?? 1500, deep: true })

  const visibility = useDocumentVisibility()
  watch(visibility, state => requestOnEntry(state === 'visible'))
  watch(useWindowFocus(), requestOnEntry)
  watch(useOnline(), requestOnEntry)

  if (options.pollIntervalMs)
    useIntervalFn(() => void request(), options.pollIntervalMs)

  // A restored session exists before this call, so no source reports it. A store has no actions during setup, so wait for it.
  queueMicrotask(() => void request())
}
