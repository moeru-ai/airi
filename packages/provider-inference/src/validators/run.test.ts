import type { ProviderDefinition, ProviderTranslator } from '../types'

import { createChatProvider } from '@xsai-ext/providers/utils'
import { describe, expect, it, vi } from 'vitest'

import { getValidatorsOfProvider, validateProvider } from './run'

const mockT = ((key: string) => key) as ProviderTranslator

describe('validateProvider', () => {
  it('resolves async validator factories and validation requirements', async () => {
    const definition: ProviderDefinition<Record<string, unknown>> = {
      id: 'async-example',
      name: 'Async example',
      description: 'Async example provider',
      nameLocalize: input => input.t('async-example'),
      descriptionLocalize: input => input.t('async-example'),
      tasks: [],
      createProviderConfig: async () => ({}) as never,
      createProvider: async () => createChatProvider({ apiKey: 'test', baseURL: 'https://example.com/v1' }),
      validationRequiredWhen: async () => true,
      validators: {
        validateConfig: [async () => ({
          id: 'async-config',
          name: 'Async config',
          validator: async () => ({ valid: true, errors: [], reason: '', reasonKey: '' }),
        })],
      },
    }

    const plan = await getValidatorsOfProvider({
      definition,
      config: {},
      schemaDefaults: {},
      contextOptions: { t: mockT },
    })

    expect(plan.shouldValidate).toBe(true)
    expect(plan.configValidators.map(validator => validator.id)).toEqual(['async-config'])
  })

  it('disposes the temporary provider after runtime validation', async () => {
    const dispose = vi.fn()
    const provider = Object.assign(
      createChatProvider({ apiKey: 'test', baseURL: 'https://example.com/v1' }),
      { dispose },
    )
    const definition: ProviderDefinition<Record<string, unknown>> = {
      id: 'example',
      name: 'Example',
      description: 'Example provider',
      nameLocalize: input => input.t('example'),
      descriptionLocalize: input => input.t('example'),
      tasks: [],
      createProviderConfig: () => ({}) as never,
      createProvider: async () => provider,
    }

    await validateProvider({
      steps: [{ id: 'runtime', label: 'Runtime', status: 'idle', reason: '', kind: 'provider' }],
      config: {},
      definition,
      configValidators: [],
      providerValidators: [{
        id: 'runtime',
        name: 'Runtime',
        validator: async () => ({ valid: true, errors: [], reason: '', reasonKey: '' }),
      }],
      providerExtra: undefined,
      shouldValidate: true,
    }, { t: mockT })

    expect(dispose).toHaveBeenCalledTimes(1)
  })
})
