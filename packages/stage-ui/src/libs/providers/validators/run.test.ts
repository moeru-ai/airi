import type { ComposerTranslation } from 'vue-i18n'

import type { ProviderDefinition } from '../types'

import { createChatProvider } from '@xsai-ext/providers/utils'
import { describe, expect, it, vi } from 'vitest'

import { validateProvider } from './run'

const mockT = ((key: string) => key) as unknown as ComposerTranslation

describe('validateProvider', () => {
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
      createProvider: () => provider,
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
