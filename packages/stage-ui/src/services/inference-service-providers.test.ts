import { describe, expect, it, vi } from 'vitest'

import { providerOpenAICompatible } from '../libs/providers/providers/openai-compatible'
import { inferenceServiceProvidersService } from './inference-service-providers'

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
    const provider = inferenceServiceProvidersService.buildLocal(providerOpenAICompatible.id, {})

    expect(provider.id).toBeDefined()
    expect(provider.definitionId).toBe(providerOpenAICompatible.id)
    expect(provider.name).toBe('OpenAI Compatible')
    expect(provider.config).toEqual({})
    expect(provider.validated).toBe(false)
    expect(provider.validationBypassed).toBe(false)
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
        validated: true,
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
