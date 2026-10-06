import type { ProviderTranslator } from '../../../types'

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { getDefinedProvider } from '../../../index'
import { getGenerationProvider, isModelProvider } from '../../../types'
import { OPPER_DEFAULT_BASE_URL, providerOpper } from './index'

const translate: ProviderTranslator = key => key

describe('providerOpper', () => {
  it('registers Opper in the portable provider registry', () => {
    expect(getDefinedProvider('opper')).toBe(providerOpper)
  })

  it('fills the default base URL when the user enters only an API key', async () => {
    const schema = await providerOpper.createProviderConfig({ t: translate })

    expect(z.parse(schema, { apiKey: 'test-key' })).toEqual({
      apiKey: 'test-key',
      baseUrl: OPPER_DEFAULT_BASE_URL,
    })
  })

  it('sends chat requests to the Opper base URL', async () => {
    const provider = await providerOpper.createProvider({ apiKey: 'test-key' })

    expect(getGenerationProvider(provider)?.generation('claude-sonnet-4-6')).toMatchObject({
      protocol: 'chat-completions',
      config: { apiKey: 'test-key', baseURL: OPPER_DEFAULT_BASE_URL, model: 'claude-sonnet-4-6' },
    })
  })

  it('lists models from the Opper base URL', async () => {
    const provider = await providerOpper.createProvider({ apiKey: 'test-key' })
    if (!isModelProvider(provider))
      throw new Error('Opper provider must list models')

    expect(provider.model()).toMatchObject({ apiKey: 'test-key', baseURL: OPPER_DEFAULT_BASE_URL })
  })
})
