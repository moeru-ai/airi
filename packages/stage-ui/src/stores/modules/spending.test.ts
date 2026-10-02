import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSettingsModels } from '../settings/models'
import { useSpendingStore } from './spending'

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

describe('spending store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // A5: the spending limit is an optional admission constraint. Without it, nothing pauses.
  it('pauses only while the user limit is reached, and lists unpriced requests', () => {
    const settings = useSettingsModels()
    const spending = useSpendingStore()
    spending.recordUsage('openai', 'priced', { inputTokens: 600_000, outputTokens: 600_000, source: 'reported' })
    spending.recordUsage('openai', 'unknown-model', { inputTokens: 1, outputTokens: 1, source: 'reported' })

    expect(spending.spendingPausedUntil()).toBeUndefined()

    settings.spendingLimitEnabled = true
    settings.spendingLimitAmount = 1
    expect(spending.spendingState()).toMatchObject({ spent: 1.2, uncounted: 1, over: true })
    expect(spending.spendingPausedUntil()).toBeGreaterThan(Date.now())

    settings.spendingLimitAmount = 5
    expect(spending.spendingPausedUntil()).toBeUndefined()
  })
})
