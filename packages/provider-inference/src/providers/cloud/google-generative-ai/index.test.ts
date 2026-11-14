import type { ChatProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import type { ChatRequestOptions } from '../../../types'

import { describe, expect, it } from 'vitest'

import { providerGoogleGenerativeAI } from './index'

async function createChatProvider() {
  return await providerGoogleGenerativeAI.createProvider({ apiKey: 'test-key' }) as ChatProviderWithExtraOptions<string, ChatRequestOptions>
}

describe('google Generative AI provider', () => {
  // https://github.com/moeru-ai/airi/issues/3178
  // ROOT CAUSE:
  //
  // Disabling reasoning sent `none` for every model.
  // Gemini 2.5 Pro and Gemini 3 reject that value.
  //
  // The fix sends `minimal` for those models.
  it('uses minimal effort for Issue #3178 when disabling reasoning for Gemini 2.5 Pro and Gemini 3', async () => {
    const provider = await createChatProvider()

    expect(provider.chat('gemini-2.5-pro', { reasoning: 'disabled' })).toMatchObject({ reasoningEffort: 'minimal' })
    expect(provider.chat('gemini-3-flash-preview', { reasoning: 'disabled' })).toMatchObject({ reasoningEffort: 'minimal' })
  })

  it('preserves supported reasoning controls and server defaults', async () => {
    const provider = await createChatProvider()

    expect(provider.chat('gemini-2.5-flash', { reasoning: 'disabled' })).toMatchObject({ reasoningEffort: 'none' })
    expect(provider.chat('gemini-3-flash-preview', { reasoning: 'enabled' })).toMatchObject({ reasoningEffort: 'medium' })
    expect(provider.chat('gemini-2.5-flash')).not.toHaveProperty('reasoningEffort')
  })
})
