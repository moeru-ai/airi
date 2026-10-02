import type { SpendingLimit } from '@proj-airi/core-agent'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

/** Currencies that model catalogs price in. */
export type SpendingCurrency = 'USD' | 'CNY'

/** The spending limit reads one rolling hour. */
export const SPENDING_WINDOW_MS = 60 * 60 * 1000
export const DEFAULT_SPENDING_LIMIT = 1

/**
 * The optional hourly spending limit.
 *
 * Use when:
 * - Admission or background work reads the spending limit.
 *
 * Returns:
 * - User values. The limit is undefined while it is off or invalid. It never changes the conversation model.
 */
export const useSettingsModels = defineStore('settings-models', () => {
  const spendingLimitEnabled = useLocalStorageManualReset<boolean>('settings/models/spending-limit-enabled', false)
  const spendingLimitAmount = useLocalStorageManualReset<number>('settings/models/spending-limit-amount', DEFAULT_SPENDING_LIMIT)
  const spendingLimitCurrency = useLocalStorageManualReset<SpendingCurrency>('settings/models/spending-limit-currency', 'USD')

  const spendingLimit = computed<SpendingLimit | undefined>(() => spendingLimitEnabled.value && Number.isFinite(spendingLimitAmount.value) && spendingLimitAmount.value > 0
    ? { amount: spendingLimitAmount.value, currency: spendingLimitCurrency.value, windowMs: SPENDING_WINDOW_MS }
    : undefined)

  function resetState() {
    spendingLimitEnabled.reset()
    spendingLimitAmount.reset()
    spendingLimitCurrency.reset()
  }

  return {
    spendingLimitEnabled,
    spendingLimitAmount,
    spendingLimitCurrency,
    spendingLimit,
    resetState,
  }
})
