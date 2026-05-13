import type { InferenceServiceProvider, InferenceServiceProviders, InferenceServiceProvidersModel } from '../models/inference-service-providers'
import type { InferenceServiceProvidersRemoteClient, InferenceServiceProvidersService, PatchConfigParams } from '../services/inference-service-providers'

import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { providerOpenAICompatible } from '../libs/providers/providers/openai-compatible'
import { createProviderCatalogListQueryOptions, createProviderCatalogStoreController } from './provider-catalog'

const localProvider = {
  id: 'local-provider',
  definitionId: providerOpenAICompatible.id,
  name: 'OpenAI Compatible',
  config: {},
  validated: false,
  validationBypassed: false,
} satisfies InferenceServiceProvider

const remoteProvider = {
  id: 'real-id',
  definitionId: providerOpenAICompatible.id,
  name: 'OpenAI Compatible',
  config: {},
  validated: false,
  validationBypassed: false,
} satisfies InferenceServiceProvider

function createMutation<TVars, TData>(mutation: (vars: TVars) => Promise<TData>) {
  return {
    error: ref<Error | null>(null),
    async mutateAsync(vars: TVars) {
      try {
        return await mutation(vars)
      }
      catch (error) {
        this.error.value = error as Error
        throw error
      }
    },
  }
}

function setupController() {
  const model: InferenceServiceProvidersModel = {
    list: vi.fn(async () => ({})),
    saveAll: vi.fn(async () => {}),
    upsert: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  }
  const service: InferenceServiceProvidersService = {
    getDefinition: vi.fn(() => providerOpenAICompatible),
    listDefinitions: vi.fn(() => [providerOpenAICompatible]),
    buildLocal: vi.fn(() => localProvider),
    fetchRemote: vi.fn(async () => ({})),
    createRemote: vi.fn(async () => remoteProvider),
    deleteRemote: vi.fn(async () => {}),
    patchConfigRemote: vi.fn(async () => ({ ...remoteProvider, id: 'provider-1', validated: true })),
  }
  const providersQuery = {
    error: ref<Error | null>(null),
    isLoading: ref(false),
    refetch: vi.fn(async () => ({
      data: {
        'remote-id': { ...remoteProvider, id: 'remote-id' },
      },
    })),
  }
  const controller = createProviderCatalogStoreController({
    addProviderMutation: createMutation<InferenceServiceProvider, InferenceServiceProvider>(provider => service.createRemote({} as InferenceServiceProvidersRemoteClient, provider)),
    commitProviderConfigMutation: createMutation<{ providerId: string, config: Record<string, unknown>, options: PatchConfigParams }, InferenceServiceProvider>(
      vars => service.patchConfigRemote({} as InferenceServiceProvidersRemoteClient, vars.providerId, vars.config, vars.options),
    ),
    configs: ref<Record<string, InferenceServiceProvider>>({}),
    model,
    providersQuery,
    removeProviderMutation: createMutation<string, void>(id => service.deleteRemote({} as InferenceServiceProvidersRemoteClient, id)),
    service,
  })

  return { controller, model, service }
}

/**
 * @example
 * describe('store provider-catalog controller', () => {})
 */
describe('store provider-catalog controller', () => {
  /**
   * @example
   * await controller.fetchList()
   */
  it('fetchList reads local configs first and then applies remote configs', async () => {
    const { controller, model } = setupController()
    vi.mocked(model.list).mockResolvedValueOnce({ 'local-id': localProvider })

    await controller.fetchList()

    expect(controller.configs.value['remote-id']).toBeDefined()
    expect(controller.configs.value['local-id']).toBeUndefined()
  })

  /**
   * @example
   * await controller.addProvider(providerOpenAICompatible.id)
   */
  it('keeps local add state and exposes mutation errors when remote add fails', async () => {
    const { controller, service } = setupController()
    const error = new Error('remote add failed')
    vi.mocked(service.createRemote).mockRejectedValueOnce(error)

    await expect(controller.addProvider(providerOpenAICompatible.id)).resolves.toEqual(localProvider)

    expect(controller.configs.value[localProvider.id]).toEqual(localProvider)
    expect(controller.mutationError.value).toBe(error)
  })

  /**
   * @example
   * await controller.commitProviderConfig('provider-1', {}, options)
   */
  it('supports remove and config commit through mutation controllers', async () => {
    const { controller, model, service } = setupController()
    controller.configs.value[localProvider.id] = localProvider

    await controller.commitProviderConfig(localProvider.id, { apiKey: 'sk-test' }, { validated: true, validationBypassed: false })
    await controller.removeProvider(localProvider.id)

    expect(service.patchConfigRemote).toHaveBeenCalled()
    expect(service.deleteRemote).toHaveBeenCalled()
    expect(model.remove).toHaveBeenCalledWith(localProvider.id)
  })

  /**
   * @example
   * await options.query({ signal })
   */
  it('passes Pinia Colada query abort signal to provider service and model', async () => {
    const service = {
      fetchRemote: vi.fn(async () => ({}) as Promise<InferenceServiceProviders>),
    }
    const model = {
      saveAll: vi.fn(async () => {}),
    }
    const controller = new AbortController()
    const options = createProviderCatalogListQueryOptions({
      client: {} as InferenceServiceProvidersRemoteClient,
      model: model as Pick<InferenceServiceProvidersModel, 'saveAll'>,
      service: service as Pick<InferenceServiceProvidersService, 'fetchRemote'>,
    })

    await options.query({ signal: controller.signal })

    expect(service.fetchRemote).toHaveBeenCalledWith({}, { abortSignal: controller.signal })
    expect(model.saveAll).toHaveBeenCalledWith({}, { abortSignal: controller.signal })
  })
})
