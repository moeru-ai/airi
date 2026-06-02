import type { ProviderDefinition } from '../../libs/providers/types'

import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { listProviders } from '../../libs/providers'
import { convertProviderDefinitionToMetadata } from './converters'

const translateKey = ((key: string) => key) as Parameters<typeof convertProviderDefinitionToMetadata>[1]

function createCatalogueProviderDefinition(options: {
  id: string
  tasks?: string[]
}) {
  return {
    id: options.id,
    tasks: options.tasks ?? ['chat'],
    name: 'Test Provider',
    nameLocalize: ({ t }: { t: (input: string) => string }) => t('name.key'),
    description: 'test',
    descriptionLocalize: ({ t }: { t: (input: string) => string }) => t('description.key'),
    createProviderConfig: () => z.object({}),
    createProvider: () => ({
      model: () => ({ baseURL: 'https://example.com/v1/' }),
    }),
  } satisfies ProviderDefinition<Record<string, never>>
}

vi.mock('@xsai/model', () => ({
  listModels: vi.fn(async () => [
    { id: 'test-model', name: 'Test Model', context_length: 8192 },
  ]),
}))

describe('providers converters', () => {
  it('keeps schema defaults when required fields are missing', () => {
    const definition = {
      id: 'test-provider',
      tasks: ['chat'],
      name: 'Test Provider',
      nameLocalize: ({ t }: { t: (input: string) => string }) => t('name.key'),
      description: 'test',
      descriptionLocalize: ({ t }: { t: (input: string) => string }) => t('description.key'),
      createProviderConfig: () => z.object({
        apiKey: z.string(),
        baseUrl: z.string().optional().default('https://example.com/v1/'),
      }),
      createProvider: () => ({}) as any,
    } as any

    const metadata = convertProviderDefinitionToMetadata(definition, ((key: string) => key) as any)

    expect(metadata.defaultOptions?.()).toMatchObject({
      baseUrl: 'https://example.com/v1/',
    })
  })

  it('keeps undeclared provider source metadata untagged', () => {
    const metadata = convertProviderDefinitionToMetadata(createCatalogueProviderDefinition({ id: 'test-provider' }), translateKey)

    expect(metadata.pricing).toBeUndefined()
    expect(metadata.deployment).toBeUndefined()
    expect(metadata.beginnerRecommended).toBeUndefined()
  })

  it('keeps the generic OpenAI-compatible provider untagged after conversion', () => {
    const definition = listProviders().find(provider => provider.id === 'openai-compatible')
    if (!definition)
      throw new Error('openai-compatible provider definition was not registered')

    const metadata = convertProviderDefinitionToMetadata(definition, translateKey)

    expect(metadata.pricing).toBeUndefined()
    expect(metadata.deployment).toBeUndefined()
    expect(metadata.beginnerRecommended).toBeUndefined()
  })

  it('combines source metadata from the provider id catalogue', () => {
    const ollama = convertProviderDefinitionToMetadata(createCatalogueProviderDefinition({
      id: 'ollama',
    }), translateKey)
    const official = convertProviderDefinitionToMetadata(createCatalogueProviderDefinition({
      id: 'official-provider',
    }), translateKey)

    expect(ollama.pricing).toBe('free')
    expect(ollama.deployment).toBe('local')
    expect(ollama.beginnerRecommended).toBeUndefined()
    expect(official.pricing).toBe('paid')
    expect(official.deployment).toBe('cloud')
    expect(official.beginnerRecommended).toBe(true)
  })

  it('keeps a cloud chat provider tagged after conversion', () => {
    const definition = listProviders().find(provider => provider.id === 'openai')
    if (!definition)
      throw new Error('openai provider definition was not registered')

    const metadata = convertProviderDefinitionToMetadata(definition, translateKey)

    expect(metadata.pricing).toBe('paid')
    expect(metadata.deployment).toBe('cloud')
  })

  it('provides generic model listing fallback for model providers', async () => {
    const definition = {
      id: 'test-provider',
      tasks: ['chat'],
      name: 'Test Provider',
      nameLocalize: ({ t }: { t: (input: string) => string }) => t('name.key'),
      description: 'test',
      descriptionLocalize: ({ t }: { t: (input: string) => string }) => t('description.key'),
      createProviderConfig: () => z.object({
        apiKey: z.string(),
        baseUrl: z.string().optional().default('https://example.com/v1/'),
      }),
      createProvider: () => ({
        model: () => ({ baseURL: 'https://example.com/v1/', apiKey: 'k' }),
      }),
      validators: {
        validateConfig: [
          () => ({
            id: 'openai-compatible:check-config',
            name: 'config',
            validator: async () => ({ errors: [], reason: '', reasonKey: '', valid: true }),
          }),
        ],
      },
      validationRequiredWhen: () => true,
    } as any

    const metadata = convertProviderDefinitionToMetadata(definition, ((key: string) => key) as any)
    const models = await metadata.capabilities.listModels?.({ apiKey: 'k', baseUrl: 'https://example.com/v1/' })

    expect(models).toMatchObject([
      {
        id: 'test-model',
        name: 'Test Model',
        provider: 'test-provider',
      },
    ])
  })

  it('adds default base url hint to validation reason when base url is missing', async () => {
    const definition = {
      id: 'test-provider',
      tasks: ['chat'],
      name: 'Test Provider',
      nameLocalize: ({ t }: { t: (input: string) => string }) => t('name.key'),
      description: 'test',
      descriptionLocalize: ({ t }: { t: (input: string) => string }) => t('description.key'),
      createProviderConfig: () => z.object({
        apiKey: z.string(),
        baseUrl: z.string().optional().default('https://example.com/v1/'),
      }),
      createProvider: () => ({
        model: () => ({ baseURL: 'https://example.com/v1/', apiKey: 'k' }),
      }),
      validators: {
        validateConfig: [
          () => ({
            id: 'openai-compatible:check-config',
            name: 'config',
            validator: async () => ({ errors: [{ error: new Error('Base URL is required.') }], reason: 'Base URL is required.', reasonKey: '', valid: false }),
          }),
        ],
      },
      validationRequiredWhen: () => true,
    } as any

    const metadata = convertProviderDefinitionToMetadata(definition, ((key: string) => key) as any)
    const result = await metadata.validators.validateProviderConfig({ apiKey: 'k' }, { skipChatPingCheck: true })

    expect(result.valid).toBe(false)
    expect(result.reason).toContain('Base URL is required.')
    expect(result.reason).toContain('Default to https://example.com/v1/.')
  })
})
