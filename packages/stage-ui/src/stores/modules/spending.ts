import type { LlmUsage, SpendingState } from '@proj-airi/core-agent'

import { estimateRequestCost } from '@proj-airi/core-agent'
import { defineStore } from 'pinia'

import { useProviderStore } from '../providers/provider'
import { useSchedulerStore } from '../scheduler'
import { useSettingsModels } from '../settings/models'

/**
 * What model requests cost, against the optional hourly spending limit.
 *
 * Use when:
 * - A model request finishes and its usage must count.
 * - Admission or background work reads whether the limit is reached.
 *
 * Expects:
 * - Every model request goes through the chat LLM store, which reports here.
 *
 * Returns:
 * - The spending state from the scheduler ledger, and when background work can resume.
 */
export const useSpendingStore = defineStore('spending', () => {
  const settings = useSettingsModels()
  const scheduler = useSchedulerStore()

  /** Counts the cost of one finished request. A request without a known price counts as uncounted. */
  function recordUsage(providerId: string, model: string, usage: LlmUsage, runId?: string) {
    // The catalog is read on demand, so recording a request does not set up provider state early.
    const pricing = useProviderStore().getModelsForProvider(providerId).find(candidate => candidate.id === model)?.metadata?.pricing
    scheduler.spending.record(estimateRequestCost(pricing, usage), runId)
  }

  /** Reads spending against the user limit. */
  function spendingState(): SpendingState {
    return scheduler.spending.check(settings.spendingLimit)
  }

  /** Returns when background work can resume, while spending is over the limit. */
  function spendingPausedUntil() {
    const state = spendingState()
    return state.over ? state.underAt : undefined
  }

  return {
    recordUsage,
    spendingState,
    spendingPausedUntil,
  }
})
