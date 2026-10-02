import type { LlmUsage, ModelLatency, ModelProfile, SpendingState } from '@proj-airi/core-agent'

import { createModelProfile, estimateRequestCost, observeLatency } from '@proj-airi/core-agent'
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

import { useProviderStore } from '../providers/provider'
import { useSchedulerStore } from '../scheduler'
import { modelTierKey, useSettingsModels } from '../settings/models'

/**
 * What this renderer knows about each configured model, and what model requests cost.
 *
 * Use when:
 * - A model request finishes and its first-token delay and usage must count.
 * - Admission reads the optional spending limit, or a router reads a model profile.
 *
 * Expects:
 * - Every model request goes through the chat LLM store, which reports here.
 *
 * Returns:
 * - Profiles from the provider catalog, the user tiers, and measured delays. Spending reads the scheduler ledger against the user limit.
 */
export const useModelProfilesStore = defineStore('model-profiles', () => {
  const settings = useSettingsModels()
  const scheduler = useSchedulerStore()
  const latency = shallowRef(new Map<string, ModelLatency>())

  function profileOf(providerId: string, model: string): ModelProfile {
    // The catalog is read on demand, so recording a request does not set up provider state early.
    const entry = useProviderStore().getModelsForProvider(providerId).find(candidate => candidate.id === model)
    return createModelProfile(
      { providerId, model, contextLength: entry?.contextLength, metadata: entry?.metadata },
      { tier: settings.tierOf(providerId, model), latency: latency.value.get(modelTierKey(providerId, model)) },
    )
  }

  /** Adds one measured first-token delay. */
  function observeFirstToken(providerId: string, model: string, firstTokenMs: number) {
    const key = modelTierKey(providerId, model)
    const next = new Map(latency.value)
    next.set(key, observeLatency(next.get(key), firstTokenMs))
    latency.value = next
  }

  /** Counts the cost of one finished request. A request without a known price counts as uncounted. */
  function recordUsage(providerId: string, model: string, usage: LlmUsage, runId?: string) {
    scheduler.spending.record(estimateRequestCost(profileOf(providerId, model).pricing, usage), runId)
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
    latency,
    profileOf,
    observeFirstToken,
    recordUsage,
    spendingState,
    spendingPausedUntil,
  }
})
