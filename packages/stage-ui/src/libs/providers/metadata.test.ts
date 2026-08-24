import type { ComposerTranslation } from 'vue-i18n'

import type { ProviderDefinition } from './types'

import { createChatProvider } from '@xsai-ext/providers/utils'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { selectProviderMetadata } from './metadata'

const t = ((key: string) => key) as ComposerTranslation

const definition = {
  id: 'test-provider',
  tasks: ['chat'],
  name: 'Test Provider',
  nameLocalize: ({ t }) => t('name.key'),
  description: 'Test provider description',
  descriptionLocalize: ({ t }) => t('description.key'),
  icon: 'i-test:provider',
  createProviderConfig: () => z.object({
    apiKey: z.string(),
    baseUrl: z.string().optional().default('https://example.com/v1/'),
  }),
  createProvider: config => createChatProvider({
    apiKey: config.apiKey,
    baseURL: config.baseUrl ?? 'https://example.com/v1/',
  }),
} satisfies ProviderDefinition<{ apiKey: string, baseUrl?: string }>

describe('provider metadata selector', () => {
  it('selects schema defaults and localized display fields', () => {
    const metadata = selectProviderMetadata(definition, t)

    expect(metadata).toMatchObject({
      id: 'test-provider',
      category: 'chat',
      name: 'Test Provider',
      nameKey: 'name.key',
      localizedName: 'name.key',
      descriptionKey: 'description.key',
      defaultConfig: {
        baseUrl: 'https://example.com/v1/',
      },
    })
  })

  it('does not copy executable definition fields', () => {
    const metadata = selectProviderMetadata(definition, t)

    expect('createProvider' in metadata).toBe(false)
    expect('createProviderConfig' in metadata).toBe(false)
    expect('validators' in metadata).toBe(false)
    expect('extraMethods' in metadata).toBe(false)
    expect(() => structuredClone(metadata)).not.toThrow()
  })

  it('supports serializable view overrides without changing the definition', () => {
    const metadata = selectProviderMetadata(definition, t, {
      id: 'vision-test-provider',
      category: 'vision',
      tasks: ['chat', 'vision'],
      to: '/settings/providers/vision/test-provider',
    })

    expect(metadata).toMatchObject({
      id: 'vision-test-provider',
      category: 'vision',
      tasks: ['chat', 'vision'],
      to: '/settings/providers/vision/test-provider',
    })
    expect(definition.id).toBe('test-provider')
    expect(definition.tasks).toEqual(['chat'])
  })
})
