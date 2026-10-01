import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

export const DEFAULT_SESSION_DORMANT_AFTER_MINUTES = 30
export const DEFAULT_SESSION_RETIRE_AFTER_DAYS = 30

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

/**
 * Idle thresholds for chat session lifecycle states.
 *
 * Use when:
 * - The session leader moves idle sessions to dormant or retired.
 *
 * Returns:
 * - User values, and their millisecond form. An invalid value falls back to its default.
 */
export const useSettingsSessionLifecycle = defineStore('settings-session-lifecycle', () => {
  const dormantAfterMinutes = useLocalStorageManualReset<number>('settings/session-lifecycle/dormant-after-minutes', DEFAULT_SESSION_DORMANT_AFTER_MINUTES)
  const retireAfterDays = useLocalStorageManualReset<number>('settings/session-lifecycle/retire-after-days', DEFAULT_SESSION_RETIRE_AFTER_DAYS)

  const positiveOr = (value: number | undefined, fallback: number) => Number.isFinite(value) && value! > 0 ? value! : fallback
  const thresholds = computed(() => ({
    dormantAfterMs: positiveOr(dormantAfterMinutes.value, DEFAULT_SESSION_DORMANT_AFTER_MINUTES) * MINUTE_MS,
    retireAfterMs: positiveOr(retireAfterDays.value, DEFAULT_SESSION_RETIRE_AFTER_DAYS) * DAY_MS,
  }))

  function resetState() {
    dormantAfterMinutes.reset()
    retireAfterDays.reset()
  }

  return {
    dormantAfterMinutes,
    retireAfterDays,
    thresholds,
    resetState,
  }
})
