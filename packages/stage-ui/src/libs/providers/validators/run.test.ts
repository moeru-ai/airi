import type { ComposerTranslation } from 'vue-i18n'

import type { ProviderDefinition } from '../types'

import { createChatProvider } from '@xsai-ext/providers/utils'
import { describe, expect, it, vi } from 'vitest'

import { getValidatorsOfProvider, validateProvider } from './run'

const mockT = ((key: string) => key) as unknown as ComposerTranslation

describe('validateProvider', () => {
  it('resolves async validator factories and validation requirements', async () => {
    const definition: ProviderDefinition<Record<string, unknown>> = {
      createProvider: async () => createChatProvider({ apiKey: 'test', baseURL: 'https://example.com/v1' }),
      createProviderConfig: async () => ({}) as never,
      description: 'Async example provider',
      descriptionLocalize: input => input.t('async-example'),
      id: 'async-example',
      name: 'Async example',
      nameLocalize: input => input.t('async-example'),
      tasks: [],
      validationRequiredWhen: async () => true,
      validators: {
        validateConfig: [async () => ({
          id: 'async-config',
          name: 'Async config',
          validator: async () => ({ errors: [], reason: '', reasonKey: '', valid: true }),
        })],
      },
    }

    const plan = await getValidatorsOfProvider({
      config: {},
      contextOptions: { t: mockT },
      definition,
      schemaDefaults: {},
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
      createProvider: async () => provider,
      createProviderConfig: () => ({}) as never,
      description: 'Example provider',
      descriptionLocalize: input => input.t('example'),
      id: 'example',
      name: 'Example',
      nameLocalize: input => input.t('example'),
      tasks: [],
    }

    await validateProvider({
      config: {},
      configValidators: [],
      definition,
      providerExtra: undefined,
      providerValidators: [{
        id: 'runtime',
        name: 'Runtime',
        validator: async () => ({ errors: [], reason: '', reasonKey: '', valid: true }),
      }],
      shouldValidate: true,
      steps: [{ id: 'runtime', kind: 'provider', label: 'Runtime', reason: '', status: 'idle' }],
    }, { t: mockT })

    expect(dispose).toHaveBeenCalledTimes(1)
  })
})
