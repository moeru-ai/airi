import type { Storage, StorageValue } from 'unstorage'

import { storage } from '../database/storage'

const STORAGE_KEY = 'local:providers'

/**
 * Persisted inference service provider configuration.
 */
export interface InferenceServiceProvider {
  /** Stable provider instance id. */
  id: string
  /** Provider definition id from the built-in provider registry. */
  definitionId: string
  /** Display name copied from the definition or server response. */
  name: string
  /** Provider-specific configuration values. */
  config: Record<string, unknown>
  /** Whether the provider config has passed validation. */
  validated: boolean
  /** Whether validation was intentionally bypassed by the user. */
  validationBypassed: boolean
}

/**
 * Options shared by inference service provider model persistence operations.
 */
export interface InferenceServiceProviderModelOptions {
  /**
   * Cancels the operation before local storage IO starts.
   */
  abortSignal?: AbortSignal
}

export type InferenceServiceProviders = Record<string, InferenceServiceProvider>

/**
 * Local persistence boundary for inference service providers.
 */
export interface InferenceServiceProvidersModel {
  /**
   * Lists locally persisted inference service providers.
   */
  list: (options?: InferenceServiceProviderModelOptions) => Promise<InferenceServiceProviders>
  /**
   * Replaces the locally persisted inference service provider snapshot.
   */
  saveAll: (providers: InferenceServiceProviders, options?: InferenceServiceProviderModelOptions) => Promise<void>
  /**
   * Inserts or replaces one locally persisted inference service provider by `id`.
   */
  upsert: (provider: InferenceServiceProvider, options?: InferenceServiceProviderModelOptions) => Promise<void>
  /**
   * Removes one locally persisted inference service provider by `id`.
   */
  remove: (id: string, options?: InferenceServiceProviderModelOptions) => Promise<void>
}

/**
 * Runtime dependencies required to create the inference service provider persistence model.
 */
export interface CreateInferenceServiceProvidersModelParams {
  /**
   * Unstorage-compatible backend used for the existing local provider snapshot.
   */
  storage: Storage<StorageValue>
}

/**
 * Creates a local persistence boundary for inference service providers.
 *
 * Use when:
 * - Wiring a runtime-specific storage implementation.
 * - Testing provider persistence without mocking module imports.
 *
 * Expects:
 * - `params.storage` is an unstorage-compatible storage instance.
 *
 * Returns:
 * - A provider model that reads and writes the existing `local:providers` key.
 */
export function createInferenceServiceProvidersModel(params: CreateInferenceServiceProvidersModelParams): InferenceServiceProvidersModel {
  const { storage: store } = params

  async function list(options?: InferenceServiceProviderModelOptions): Promise<InferenceServiceProviders> {
    options?.abortSignal?.throwIfAborted()
    const providers = await store.getItemRaw<InferenceServiceProviders>(STORAGE_KEY) || {}
    options?.abortSignal?.throwIfAborted()
    return providers
  }

  async function saveAll(providers: InferenceServiceProviders, options?: InferenceServiceProviderModelOptions): Promise<void> {
    options?.abortSignal?.throwIfAborted()
    await store.setItemRaw(STORAGE_KEY, providers)
    options?.abortSignal?.throwIfAborted()
  }

  async function upsert(provider: InferenceServiceProvider, options?: InferenceServiceProviderModelOptions): Promise<void> {
    options?.abortSignal?.throwIfAborted()
    const all = await list(options)
    options?.abortSignal?.throwIfAborted()
    all[provider.id] = provider
    await saveAll(all, options)
  }

  async function remove(id: string, options?: InferenceServiceProviderModelOptions): Promise<void> {
    options?.abortSignal?.throwIfAborted()
    const all = await list(options)
    options?.abortSignal?.throwIfAborted()
    delete all[id]
    await saveAll(all, options)
  }

  return {
    list,
    saveAll,
    upsert,
    remove,
  }
}

export const inferenceServiceProvidersModel = createInferenceServiceProvidersModel({ storage })
