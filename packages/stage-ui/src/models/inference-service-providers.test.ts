import type { InferenceServiceProvider } from './inference-service-providers'

import memoryDriver from 'unstorage/drivers/memory'

import { createStorage } from 'unstorage'
import { beforeEach, describe, expect, it } from 'vitest'

import { createInferenceServiceProvidersModel } from './inference-service-providers'

const provider = {
  id: 'provider-1',
  definitionId: 'openai-compatible',
  name: 'OpenAI Compatible',
  config: { apiKey: 'sk-test' },
  validated: true,
  validationBypassed: false,
} satisfies InferenceServiceProvider

/**
 * @example
 * describe('models inference-service-providers', () => {})
 */
describe('models inference-service-providers', () => {
  let store: ReturnType<typeof createStorage>
  let providers: ReturnType<typeof createInferenceServiceProvidersModel>

  beforeEach(() => {
    store = createStorage({
      driver: memoryDriver(),
    })
    providers = createInferenceServiceProvidersModel({ storage: store })
  })

  /**
   * @example
   * expect(await providers.list()).toEqual({})
   */
  it('lists providers from the existing local storage key', async () => {
    await store.setItemRaw('local:providers', { [provider.id]: provider })

    await expect(providers.list()).resolves.toEqual({ [provider.id]: provider })
  })

  /**
   * @example
   * await providers.saveAll({ [provider.id]: provider })
   */
  it('saves all providers to the existing local storage key', async () => {
    await providers.saveAll({ [provider.id]: provider })

    await expect(store.getItemRaw('local:providers')).resolves.toEqual({ [provider.id]: provider })
  })

  /**
   * @example
   * await providers.upsert(provider)
   */
  it('upserts a provider by id', async () => {
    await providers.upsert(provider)

    await expect(store.getItemRaw('local:providers')).resolves.toEqual({ [provider.id]: provider })
  })

  /**
   * @example
   * await providers.remove('provider-1')
   */
  it('removes a provider by id', async () => {
    await store.setItemRaw('local:providers', { [provider.id]: provider })

    await providers.remove(provider.id)

    await expect(store.getItemRaw('local:providers')).resolves.toEqual({})
  })

  /**
   * @example
   * await expect(providers.list({ abortSignal: signal })).rejects.toThrow()
   */
  it('throws before local IO when aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(providers.list({ abortSignal: controller.signal })).rejects.toThrow()
  })

  /**
   * @example
   * await expect(providers.upsert(provider, { abortSignal })).rejects.toThrow()
   */
  it('throws after local read before follow-up writes when aborted', async () => {
    await store.setItemRaw('local:providers', {})
    const controller = new AbortController()
    const originalGetItemRaw = store.getItemRaw.bind(store)
    store.getItemRaw = async (...args) => {
      const value = await originalGetItemRaw(...args)
      controller.abort()
      return value
    }

    await expect(providers.upsert(provider, { abortSignal: controller.signal })).rejects.toThrow()
    await expect(store.getItemRaw('local:providers')).resolves.toEqual({})
  })
})
