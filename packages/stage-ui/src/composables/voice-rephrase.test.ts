import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OFFICIAL_CHAT_PROVIDER_ID } from '../libs/providers/providers/official/constants'
import { useVoiceRephrase } from './voice-rephrase'

const stores = vi.hoisted(() => ({
  hearing: { rephraseProvider: '', rephraseModel: '' },
  consciousness: { activeProvider: '', activeModel: '' },
}))

const textGeneration = vi.hoisted(() => ({
  selections: [] as { providerId: string, model: string }[],
}))

vi.mock('../stores/modules/hearing', () => ({
  useHearingStore: () => stores.hearing,
}))

vi.mock('../stores/modules/consciousness', () => ({
  useConsciousnessStore: () => stores.consciousness,
}))

vi.mock('./text-generation', () => ({
  useTextGeneration: () => ({
    generateText: (selection: { providerId: string, model: string }) => {
      textGeneration.selections.push(selection)
      return async () => '["fixed"]'
    },
  }),
}))

describe('useVoiceRephrase', () => {
  beforeEach(() => {
    stores.hearing.rephraseProvider = ''
    stores.hearing.rephraseModel = ''
    stores.consciousness.activeProvider = OFFICIAL_CHAT_PROVIDER_ID
    stores.consciousness.activeModel = 'auto'
    textGeneration.selections.length = 0
  })

  /**
   * @example
   * hearing.rephraseProvider = 'official-provider'
   * hearing.rephraseModel = 'asr-rewrite'
   */
  it('sends the rewrite request to asr-rewrite when Hearing selects it', async () => {
    stores.hearing.rephraseProvider = OFFICIAL_CHAT_PROVIDER_ID
    stores.hearing.rephraseModel = 'asr-rewrite'

    await expect(useVoiceRephrase().rephrase(['uh hello'], new AbortController().signal)).resolves.toEqual(['fixed'])

    expect(textGeneration.selections).toEqual([{ providerId: OFFICIAL_CHAT_PROVIDER_ID, model: 'asr-rewrite' }])
  })

  it('sends the rewrite request to the chat model when Hearing selects no model', async () => {
    await expect(useVoiceRephrase().rephrase(['uh hello'], new AbortController().signal)).resolves.toEqual(['fixed'])

    expect(textGeneration.selections).toEqual([{ providerId: OFFICIAL_CHAT_PROVIDER_ID, model: 'auto' }])
  })
})
