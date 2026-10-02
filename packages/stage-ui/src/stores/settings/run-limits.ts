import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

export const DEFAULT_MAX_CONCURRENT_RUNS = 4
export const DEFAULT_MAX_QUEUED_PER_SESSION = 8
export const DEFAULT_STALL_TIMEOUT_SECONDS = 60
export const DEFAULT_RUN_DEADLINE_MINUTES = 10

/**
 * Capacity and supervision limits for chat runs.
 *
 * Use when:
 * - The chat runtime admits, schedules, or supervises runs.
 *
 * Returns:
 * - User values, and the runtime form in counts and milliseconds. An invalid value falls back to its default.
 */
export const useSettingsRunLimits = defineStore('settings-run-limits', () => {
  const maxConcurrentRuns = useLocalStorageManualReset<number>('settings/run-limits/max-concurrent-runs', DEFAULT_MAX_CONCURRENT_RUNS)
  const maxQueuedPerSession = useLocalStorageManualReset<number>('settings/run-limits/max-queued-per-session', DEFAULT_MAX_QUEUED_PER_SESSION)
  const stallTimeoutSeconds = useLocalStorageManualReset<number>('settings/run-limits/stall-timeout-seconds', DEFAULT_STALL_TIMEOUT_SECONDS)
  const runDeadlineMinutes = useLocalStorageManualReset<number>('settings/run-limits/run-deadline-minutes', DEFAULT_RUN_DEADLINE_MINUTES)

  const positiveIntegerOr = (value: number | undefined, fallback: number) => Number.isInteger(value) && value! > 0 ? value! : fallback
  const limits = computed(() => ({
    maxConcurrentRuns: positiveIntegerOr(maxConcurrentRuns.value, DEFAULT_MAX_CONCURRENT_RUNS),
    maxQueuedPerSession: positiveIntegerOr(maxQueuedPerSession.value, DEFAULT_MAX_QUEUED_PER_SESSION),
    stallTimeoutMs: positiveIntegerOr(stallTimeoutSeconds.value, DEFAULT_STALL_TIMEOUT_SECONDS) * 1000,
    runDeadlineMs: positiveIntegerOr(runDeadlineMinutes.value, DEFAULT_RUN_DEADLINE_MINUTES) * 60_000,
  }))

  function resetState() {
    maxConcurrentRuns.reset()
    maxQueuedPerSession.reset()
    stallTimeoutSeconds.reset()
    runDeadlineMinutes.reset()
  }

  return {
    maxConcurrentRuns,
    maxQueuedPerSession,
    stallTimeoutSeconds,
    runDeadlineMinutes,
    limits,
    resetState,
  }
})
