import { IntakeLog, LeaseTable, RunTable } from '@proj-airi/core-agent'
import { defineStore } from 'pinia'
import { markRaw } from 'vue'

/**
 * Run table, intake trace, and exclusive leases shared by every run owner in this renderer.
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

  return {
    runs,
    intake,
    leases,
  }
})
