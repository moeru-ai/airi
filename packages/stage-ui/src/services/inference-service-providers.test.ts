import { describe, expect, it, vi } from 'vitest'
import { parse as parseSchema } from 'zod/v4/core'

import { getDefinedProvider } from '../libs/providers/providers'
import { OFFICIAL_CHAT_PROVIDER_ID } from '../libs/providers/providers/official'
import { inferenceServiceProvidersService } from './inference-service-providers'

function getRequiredProvider(id: string) {
  const provider = getDefinedProvider(id)
  if (!provider)
    throw new Error(`Provider definition "${id}" is not registered.`)

  return provider
}

const atlasCloudProvider = getRequiredProvider('atlascloud')
const openAICompatibleProvider = getRequiredProvider('openai-compatible')

/**
 * @example
 * describe('services inference-service-providers', () => {})
 */
describe('services inference-service-providers', () => {
  /**
   * @example
   * const provider = inferenceServiceProvidersService.buildLocal('openai-compatible')
   */
  it('builds a local provider from a known definition', () => {
    const provider = inferenceServiceProvidersService.buildLocal(openAICompatibleProvider.id, {})

    expect(provider.id).toBeDefined()
    expect(provider.definitionId).toBe(openAICompatibleProvider.id)
    expect(provider.displayName).toBe(openAICompatibleProvider.name)
    expect(provider.config).toEqual({})
    expect(provider.status).toBe('unconfigured')
    expect(provider.configuredBy).toBe('user')
  })

  it('preserves definition-owned authentication configuration', () => {
    const provider = inferenceServiceProvidersService.buildLocal(OFFICIAL_CHAT_PROVIDER_ID, {})

    expect(provider.configuredBy).toBe('authentication')
  })

  /**
   * @example
   * const provider = inferenceServiceProvidersService.buildLocal('atlascloud', { apiKey: '...' })
   */
  it('lists Atlas Cloud as a built-in OpenAI-compatible provider', async () => {
    const schema = await atlasCloudProvider.createProviderConfig({ t: (key: string) => key })

    expect(atlasCloudProvider.name).toBe('Atlas Cloud')
    expect(parseSchema(schema, { apiKey: 'test-key' })).toEqual({
      apiKey: 'test-key',
      baseUrl: 'https://api.atlascloud.ai/v1',
    })
    expect(inferenceServiceProvidersService.buildLocal(atlasCloudProvider.id, { apiKey: 'test-key' })).toEqual(expect.objectContaining({
      definitionId: atlasCloudProvider.id,
      config: { apiKey: 'test-key' },
    }))
  })

  /**
   * @example
   * expect(() => inferenceServiceProvidersService.buildLocal('missing')).toThrow()
   */
  it('rejects unknown provider definitions', () => {
    expect(() => inferenceServiceProvidersService.buildLocal('missing-definition', {})).toThrow('Provider definition with id "missing-definition" not found.')
  })

  /**
   * @example
   * await inferenceServiceProvidersService.fetchRemote(client)
   */
  it('fetches remote providers and indexes them by id', async () => {
    const client = {
      api: {
        v1: {
          providers: {
            '$get': vi.fn(async () => ({
              ok: true,
              json: async () => [{
                id: 'provider-1',
                definitionId: openAICompatibleProvider.id,
                name: 'OpenAI Compatible',
                displayName: 'Local OpenAI',
                config: { baseUrl: 'https://example.com/v1/' },
                validated: true,
                validationBypassed: false,
              }],
            })),
            '$post': vi.fn(async () => ({
              ok: true,
              json: async () => ({
                id: 'provider-1',
                definitionId: openAICompatibleProvider.id,
                name: 'OpenAI Compatible',
                config: {},
                validated: false,
                validationBypassed: false,
              }),
            })),
            ':id': {
              $delete: vi.fn(async () => ({ ok: true })),
              $patch: vi.fn(async () => ({
                ok: true,
                json: async () => ({
                  id: 'provider-1',
                  definitionId: openAICompatibleProvider.id,
                  name: 'OpenAI Compatible',
                  config: {},
                  validated: false,
                  validationBypassed: false,
                }),
              })),
            },
          },
        },
      },
    }

    await expect(inferenceServiceProvidersService.fetchRemote(client)).resolves.toEqual({
      'provider-1': expect.objectContaining({
        config: { baseUrl: 'https://example.com/v1/' },
        displayName: 'Local OpenAI',
        id: 'provider-1',
        status: 'configured',
        configuredBy: 'user',
      }),
    })
  })

  it('uses the definition name when a remote provider has no display name', async () => {
    const client = {
      api: {
        v1: {
          providers: {
            $get: vi.fn(async () => ({
              ok: true,
              json: async () => [{
                id: 'provider-without-name',
                definitionId: openAICompatibleProvider.id,
                name: openAICompatibleProvider.name,
                config: {},
                validated: false,
                validationBypassed: false,
              }],
            })),
          },
        },
      },
    }

    await expect(inferenceServiceProvidersService.fetchRemote(client as never)).resolves.toEqual({
      'provider-without-name': expect.objectContaining({
        displayName: undefined,
        definitionId: openAICompatibleProvider.id,
      }),
    })
  })

  it('sends display names when it creates and updates remote providers', async () => {
    const post = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: 'provider-1',
        definitionId: openAICompatibleProvider.id,
        name: openAICompatibleProvider.name,
        displayName: 'Production OpenAI',
        config: {},
        validated: false,
        validationBypassed: false,
      }),
    }))
    const patch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: 'provider-1',
        definitionId: openAICompatibleProvider.id,
        name: openAICompatibleProvider.name,
        displayName: 'Staging OpenAI',
        config: { baseUrl: 'https://staging.example.com/v1' },
        validated: false,
        validationBypassed: false,
      }),
    }))
    const client = {
      api: {
        v1: {
          providers: {
            '$post': post,
            ':id': {
              $patch: patch,
            },
          },
        },
      },
    }
    const provider = inferenceServiceProvidersService.buildLocal(openAICompatibleProvider.id)

    await inferenceServiceProvidersService.createRemote(client as never, {
      ...provider,
      displayName: 'Production OpenAI',
    })
    await inferenceServiceProvidersService.patchConfigRemote(
      client as never,
      provider.id,
      { baseUrl: 'https://staging.example.com/v1' },
      'configured',
      'Staging OpenAI',
    )

    expect(post).toHaveBeenCalledWith({
      json: expect.objectContaining({ displayName: 'Production OpenAI' }),
    }, undefined)
    expect(patch).toHaveBeenCalledWith({
      param: { id: provider.id },
      json: expect.objectContaining({ displayName: 'Staging OpenAI' }),
    }, undefined)
  })

  it('keeps the requested display name when an older remote response omits it', async () => {
    const patch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: 'provider-1',
        definitionId: openAICompatibleProvider.id,
        name: openAICompatibleProvider.name,
        config: { baseUrl: 'https://staging.example.com/v1' },
        validated: false,
        validationBypassed: false,
      }),
    }))
    const client = {
      api: {
        v1: {
          providers: {
            ':id': {
              $patch: patch,
            },
          },
        },
      },
    }
    const provider = inferenceServiceProvidersService.buildLocal(openAICompatibleProvider.id)

    await expect(inferenceServiceProvidersService.patchConfigRemote(
      client as never,
      provider.id,
      { baseUrl: 'https://staging.example.com/v1' },
      'configured',
      'Staging OpenAI',
    )).resolves.toMatchObject({
      displayName: 'Staging OpenAI',
    })
  })

  /**
   * @example
   * await expect(inferenceServiceProvidersService.fetchRemote(client, { abortSignal })).rejects.toThrow()
   */
  it('throws before remote work when aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const client = {
      api: {
        v1: {
          providers: {
            '$get': vi.fn(),
            '$post': vi.fn(),
            ':id': {
              $delete: vi.fn(),
              $patch: vi.fn(),
            },
          },
        },
      },
    }

    await expect(inferenceServiceProvidersService.fetchRemote(client, { abortSignal: controller.signal })).rejects.toThrow()
  })
})
