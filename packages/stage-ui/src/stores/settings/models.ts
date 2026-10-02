import type { ModelTier, SpendingLimit } from '@proj-airi/core-agent'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

export type { ModelTier }

/** Currencies that model catalogs price in. */
export type SpendingCurrency = 'USD' | 'CNY'

/** The spending limit reads one rolling hour. */
export const SPENDING_WINDOW_MS = 60 * 60 * 1000
export const DEFAULT_SPENDING_LIMIT = 1

/** Storage key of one model's tier. */
export function modelTierKey(providerId: string, model: string) {
  return JSON.stringify([providerId, model])
}

/**
 * Model tiers and the optional spending limit.
 *
 * Use when:
 * - A router checks the tier that the user gave a model, or admission reads the spending limit.
 *
 * Returns:
 * - User values. The limit is undefined while it is off or invalid. The conversation model is chosen elsewhere, and neither value changes it.
 */
export const useSettingsModels = defineStore('settings-models', () => {
  const tiers = useLocalStorageManualReset<Record<string, ModelTier>>('settings/models/tiers', {})
  const spendingLimitEnabled = useLocalStorageManualReset<boolean>('settings/models/spending-limit-enabled', false)
  const spendingLimitAmount = useLocalStorageManualReset<number>('settings/models/spending-limit-amount', DEFAULT_SPENDING_LIMIT)
  const spendingLimitCurrency = useLocalStorageManualReset<SpendingCurrency>('settings/models/spending-limit-currency', 'USD')

  const spendingLimit = computed<SpendingLimit | undefined>(() => spendingLimitEnabled.value && Number.isFinite(spendingLimitAmount.value) && spendingLimitAmount.value > 0
    ? { amount: spendingLimitAmount.value, currency: spendingLimitCurrency.value, windowMs: SPENDING_WINDOW_MS }
    : undefined)

  function tierOf(providerId: string, model: string): ModelTier | undefined {
    return tiers.value[modelTierKey(providerId, model)]
  }

  /** Sets or clears the tier of one model. */
  function setTier(providerId: string, model: string, tier: ModelTier | undefined) {
    const next = { ...tiers.value }
    if (tier)
      next[modelTierKey(providerId, model)] = tier
    else
      delete next[modelTierKey(providerId, model)]
    tiers.value = next
  }

  function resetState() {
    tiers.reset()
    spendingLimitEnabled.reset()
    spendingLimitAmount.reset()
    spendingLimitCurrency.reset()
  }

  return {
    tiers,
    spendingLimitEnabled,
    spendingLimitAmount,
    spendingLimitCurrency,
    spendingLimit,
    tierOf,
    setTier,
    resetState,
  }
})
