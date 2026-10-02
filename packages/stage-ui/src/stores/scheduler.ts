import { ErrorBurstBreaker, IntakeLog, LeaseTable, RunTable, SpendingLedger } from '@proj-airi/core-agent'
import { defineStore } from 'pinia'
import { markRaw } from 'vue'

/**
 * Run table, intake trace, exclusive leases, the error burst breaker, and the spending ledger shared by every run owner in this renderer.
 *
 * Use when:
 * - Chat sends and notification handling must see the same runs and the same voice owner.
 *
 * Expects:
 * - Only the renderer that runs the work writes these tables. They are not replicated.
 *
 * Returns:
 * - Raw class instances. Observers subscribe to them directly.
 */
export const useSchedulerStore = defineStore('scheduler', () => {
  const runs = markRaw(new RunTable())
  const intake = markRaw(new IntakeLog())
  const leases = markRaw(new LeaseTable())
  // A burst of failed runs pauses background work. Direct owner input does not read it.
  const errorBurst = markRaw(new ErrorBurstBreaker())
  runs.subscribe(run => errorBurst.observe(run))
  // Model request costs for the optional user spending limit.
  const spending = markRaw(new SpendingLedger())

  return {
    runs,
    intake,
    leases,
    errorBurst,
    spending,
  }
})
