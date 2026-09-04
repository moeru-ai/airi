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
        id: 'provider-1',
        status: 'configured',
        configuredBy: 'user',
      }),
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
