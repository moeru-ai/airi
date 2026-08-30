import { describe, expect, it, vi } from 'vitest'
import { parse as parseSchema } from 'zod/v4/core'

import { CUSTOM_MODEL_DEFINITION_ID } from '../libs/providers/custom-model/config'
import { ATLASCLOUD_DEFAULT_BASE_URL, providerAtlasCloud } from '../libs/providers/providers/atlascloud'
import { OFFICIAL_CHAT_PROVIDER_ID } from '../libs/providers/providers/official'
import { providerOpenAICompatible } from '../libs/providers/providers/openai-compatible'
import { createInferenceServiceProvidersService, inferenceServiceProvidersService } from './inference-service-providers'

import '../libs/providers/providers/custom-model'

describe('inference service providers', () => {
  it('builds custom model instances as local persistence', () => {
    const service = createInferenceServiceProvidersService()
    const provider = service.buildLocal(CUSTOM_MODEL_DEFINITION_ID)

    expect(provider.definitionId).toBe(CUSTOM_MODEL_DEFINITION_ID)
    expect(provider.persistence).toBe('local')
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
    const schema = await providerAtlasCloud.createProviderConfig({ t: (key: string) => key })

    expect(providerAtlasCloud.name).toBe('Atlas Cloud')
    expect(parseSchema(schema, { apiKey: 'test-key' })).toEqual({
      apiKey: 'test-key',
      baseUrl: ATLASCLOUD_DEFAULT_BASE_URL,
    })
    expect(inferenceServiceProvidersService.buildLocal(providerAtlasCloud.id, { apiKey: 'test-key' })).toEqual(expect.objectContaining({
      definitionId: providerAtlasCloud.id,
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
                definitionId: providerOpenAICompatible.id,
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
                definitionId: providerOpenAICompatible.id,
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
                  definitionId: providerOpenAICompatible.id,
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
