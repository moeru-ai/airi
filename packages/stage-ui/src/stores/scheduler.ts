import { ErrorBurstBreaker, IntakeLog, LeaseTable, RunTable } from '@proj-airi/core-agent'
import { defineStore } from 'pinia'
import { markRaw } from 'vue'

/**
 * Run table, intake trace, exclusive leases, and the error burst breaker shared by every run owner in this renderer.
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

  return {
    runs,
    intake,
    leases,
    errorBurst,
  }
})
