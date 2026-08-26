import type { ComposerTranslation } from 'vue-i18n'

import type { ProviderDefinition } from './types'

import { createChatProvider } from '@xsai-ext/providers/utils'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { selectProviderMetadata } from './metadata'

const t = ((key: string) => key) as ComposerTranslation

const definition = {
  createProvider: config => createChatProvider({
    apiKey: config.apiKey,
    baseURL: config.baseUrl ?? 'https://example.com/v1/',
  }),
  createProviderConfig: async () => z.object({
    apiKey: z.string(),
    baseUrl: z.string().optional().default('https://example.com/v1/'),
  }),
  description: 'Test provider description',
  descriptionLocalize: ({ t }) => t('description.key'),
  icon: 'i-test:provider',
  id: 'test-provider',
  name: 'Test Provider',
  nameLocalize: ({ t }) => t('name.key'),
  tasks: ['chat'],
} satisfies ProviderDefinition<{ apiKey: string, baseUrl?: string }>

describe('provider metadata selector', () => {
  it('selects schema defaults from an async Provider schema', async () => {
    const metadata = await selectProviderMetadata(definition, t)

    expect(metadata).toMatchObject({
      category: 'chat',
      defaultConfig: {
        baseUrl: 'https://example.com/v1/',
      },
      descriptionKey: 'description.key',
      id: 'test-provider',
      localizedName: 'name.key',
      name: 'Test Provider',
      nameKey: 'name.key',
    })
  })

  it('does not copy executable definition fields', async () => {
    const metadata = await selectProviderMetadata(definition, t)

    expect('createProvider' in metadata).toBe(false)
    expect('createProviderConfig' in metadata).toBe(false)
    expect('validators' in metadata).toBe(false)
    expect('extraMethods' in metadata).toBe(false)
    expect(() => structuredClone(metadata)).not.toThrow()
  })

  it('supports serializable view overrides without changing the definition', async () => {
    const metadata = await selectProviderMetadata(definition, t, {
      category: 'vision',
      id: 'vision-test-provider',
      tasks: ['chat', 'vision'],
      to: '/settings/providers/vision/test-provider',
    })

    expect(metadata).toMatchObject({
      category: 'vision',
      id: 'vision-test-provider',
      tasks: ['chat', 'vision'],
      to: '/settings/providers/vision/test-provider',
    })
    expect(definition.id).toBe('test-provider')
    expect(definition.tasks).toEqual(['chat'])
  })
})
