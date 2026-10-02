import type { AgentRun } from './run-table'

/** Failures within this window count toward one burst. */
export const ERROR_BURST_WINDOW_MS = 60_000
/** Failures in one window that start a cooldown. */
export const ERROR_BURST_LIMIT = 3
/** Background work waits this long after a burst. */
export const ERROR_BURST_COOLDOWN_MS = 60_000

/**
 * Detects bursts of failed runs, for example while a provider is down.
 *
 * Use when:
 * - Background work must wait instead of failing again and again.
 *
 * Expects:
 * - Every run change reaches {@link observe}. Only `blocked` runs count. Expired, dropped, and done runs do not.
 *
 * Returns:
 * - The time until which background work waits. Direct owner input never waits for it, so the owner sees each failure.
 */
export class ErrorBurstBreaker {
  private failures: number[] = []
  private coolUntil = 0

  constructor(private readonly options: { now?: () => number } = {}) {}

  observe(run: AgentRun) {
    if (run.state !== 'blocked')
      return
    const now = this.now()
    this.failures = [...this.failures.filter(at => now - at < ERROR_BURST_WINDOW_MS), now]
    if (this.failures.length >= ERROR_BURST_LIMIT) {
      this.coolUntil = now + ERROR_BURST_COOLDOWN_MS
      this.failures = []
    }
  }

  /** Returns the end of the current cooldown, or `undefined` when background work can run. */
  coolingUntil(): number | undefined {
    return this.coolUntil > this.now() ? this.coolUntil : undefined
  }

  private now() {
    return this.options.now?.() ?? Date.now()
  }
}
