import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSettingsModels } from '../settings/models'
import { useModelProfilesStore } from './model-profiles'

const catalog = vi.hoisted(() => ({
  models: [{
    id: 'priced',
    name: 'Priced',
    provider: 'openai',
    contextLength: 128_000,
    metadata: {
      abilities: { functionCall: true },
      pricing: { currency: 'USD', units: [
        { name: 'textInput', strategy: 'fixed', unit: 'millionTokens', rate: 1 },
        { name: 'textOutput', strategy: 'fixed', unit: 'millionTokens', rate: 1 },
      ] },
    },
  }],
}))

vi.mock('../providers/provider', () => ({ useProviderStore: () => ({ getModelsForProvider: () => catalog.models }) }))

describe('model profiles store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('profiles a configured model from its catalog entry, user tier, and measured delay', () => {
    useSettingsModels().setTier('openai', 'priced', 'fast')
    const profiles = useModelProfilesStore()
    profiles.observeFirstToken('openai', 'priced', 400)

    expect(profiles.profileOf('openai', 'priced')).toMatchObject({
      abilities: { tools: true },
      contextLength: 128_000,
      tier: 'fast',
      latency: { firstTokenMs: 400, samples: 1 },
    })
  })

  // A5: the spending limit is an optional admission constraint. Without it, nothing pauses.
  it('pauses only while the user limit is reached, and lists unpriced requests', () => {
    const settings = useSettingsModels()
    const profiles = useModelProfilesStore()
    profiles.recordUsage('openai', 'priced', { inputTokens: 600_000, outputTokens: 600_000, source: 'reported' })
    profiles.recordUsage('openai', 'unknown-model', { inputTokens: 1, outputTokens: 1, source: 'reported' })

    expect(profiles.spendingPausedUntil()).toBeUndefined()

    settings.spendingLimitEnabled = true
    settings.spendingLimitAmount = 1
    expect(profiles.spendingState()).toMatchObject({ spent: 1.2, uncounted: 1, over: true })
    expect(profiles.spendingPausedUntil()).toBeGreaterThan(Date.now())

    settings.spendingLimitAmount = 5
    expect(profiles.spendingPausedUntil()).toBeUndefined()
  })
})
