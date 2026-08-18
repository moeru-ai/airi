import type { InferenceServiceProvider, ProviderValidationStatus } from '../libs/providers/types'

import { nanoid } from 'nanoid'

import { getDefinedProvider } from '../libs/providers/providers'

type InferenceServiceProviders = Record<string, InferenceServiceProvider>

interface RequestOptions {
  init: { signal: AbortSignal }
}

interface RemoteResponse<T> {
  json: () => Promise<T>
  ok: boolean
}

/**
 * Remote inference provider API surface required by the provider service.
 */
export interface InferenceServiceProvidersRemoteClient {
  api: {
    v1: {
      providers: {
        '$get': (params?: undefined, options?: RequestOptions) => Promise<RemoteResponse<unknown[]>>
        '$post': (params: { json: {
          id: string
          definitionId: string
          name: string
          config: Record<string, unknown>
          validated: boolean
          validationBypassed: boolean
        } }, options?: RequestOptions) => Promise<RemoteResponse<unknown>>
        ':id': {
          $delete: (params: { param: { id: string } }, options?: RequestOptions) => Promise<{ ok: boolean }>
          $patch: (params: {
            json: {
              config: Record<string, unknown>
              validated: boolean
              validationBypassed: boolean
            }
            param: { id: string }
          }, options?: RequestOptions) => Promise<RemoteResponse<unknown>>
        }
      }
    }
  }
}

/**
 * Options shared by inference service provider service operations.
 */
export interface InferenceServiceProviderServiceOptions {
  /**
   * Cancels the operation before or after remote IO.
   */
  abortSignal?: AbortSignal
}

/**
 * Inference service provider domain operations used by controller stores.
 */
export interface InferenceServiceProvidersService {
  /** Builds an optimistic local provider config. */
  buildLocal: (definitionId: string, initialConfig?: Record<string, unknown>) => InferenceServiceProvider
  /** Fetches and indexes remote provider configs. */
  fetchRemote: (client: InferenceServiceProvidersRemoteClient, options?: InferenceServiceProviderServiceOptions) => Promise<InferenceServiceProviders>
  /** Creates and normalizes one remote provider config. */
  createRemote: (client: InferenceServiceProvidersRemoteClient, provider: InferenceServiceProvider, options?: InferenceServiceProviderServiceOptions) => Promise<InferenceServiceProvider>
  /** Deletes one remote provider config. */
  deleteRemote: (client: InferenceServiceProvidersRemoteClient, providerId: string, options?: InferenceServiceProviderServiceOptions) => Promise<void>
  /** Patches and normalizes one remote provider config. */
  patchConfigRemote: (
    client: InferenceServiceProvidersRemoteClient,
    providerId: string,
    config: Record<string, unknown>,
    status: ProviderValidationStatus,
    options?: InferenceServiceProviderServiceOptions,
  ) => Promise<InferenceServiceProvider>
}

/**
 * Creates the inference service provider facade consumed by controller stores.
 *
 * Use when:
 * - Wiring controller stores to provider domain operations.
 * - Tests need to replace the whole service surface with one mock object.
 *
 * Expects:
 * - No runtime dependencies are required yet.
 *
 * Returns:
 * - A stable object containing provider domain operations.
 */
export function createInferenceServiceProvidersService(): InferenceServiceProvidersService {
  function requestOptions(options?: InferenceServiceProviderServiceOptions): RequestOptions | undefined {
    return options?.abortSignal ? { init: { signal: options.abortSignal } } : undefined
  }

  function buildLocal(definitionId: string, initialConfig: Record<string, unknown> = {}): InferenceServiceProvider {
    const definition = getDefinedProvider(definitionId)
    if (!definition)
      throw new Error(`Provider definition with id "${definitionId}" not found.`)

    return {
      id: nanoid(),
      definitionId,
      config: initialConfig,
      status: 'unconfigured',
    }
  }

  function normalize(value: unknown): InferenceServiceProvider {
    const item = value as InferenceServiceProvider & {
      validated: boolean
      validationBypassed: boolean
    }
    let status: ProviderValidationStatus = 'unconfigured'
    if (item.validated)
      status = 'configured'
    else if (item.validationBypassed)
      status = 'bypassed'

    return {
      id: item.id,
      definitionId: item.definitionId,
      config: item.config,
      status,
    }
  }

  async function fetchRemote(client: InferenceServiceProvidersRemoteClient, options?: InferenceServiceProviderServiceOptions): Promise<InferenceServiceProviders> {
    options?.abortSignal?.throwIfAborted()
    const res = await client.api.v1.providers.$get(undefined, requestOptions(options))
    if (!res.ok)
      throw new Error('Failed to fetch providers')

    const data = await res.json() as unknown[]
    options?.abortSignal?.throwIfAborted()

    const providers: InferenceServiceProviders = {}
    for (const item of data) {
      const provider = normalize(item)
      providers[provider.id] = provider
    }
    return providers
  }

  async function createRemote(client: InferenceServiceProvidersRemoteClient, provider: InferenceServiceProvider, options?: InferenceServiceProviderServiceOptions): Promise<InferenceServiceProvider> {
    options?.abortSignal?.throwIfAborted()
    const res = await client.api.v1.providers.$post({
      json: {
        id: provider.id,
        definitionId: provider.definitionId,
        name: getDefinedProvider(provider.definitionId)?.name ?? provider.definitionId,
        config: provider.config,
        validated: provider.status === 'configured',
        validationBypassed: provider.status === 'bypassed',
      },
    }, requestOptions(options))
    if (!res.ok)
      throw new Error('Failed to add provider')

    const item = await res.json()
    options?.abortSignal?.throwIfAborted()
    return normalize(item)
  }

  async function deleteRemote(client: InferenceServiceProvidersRemoteClient, providerId: string, options?: InferenceServiceProviderServiceOptions): Promise<void> {
    options?.abortSignal?.throwIfAborted()
    const res = await client.api.v1.providers[':id'].$delete({
      param: { id: providerId },
    }, requestOptions(options))
    if (!res.ok)
      throw new Error('Failed to remove provider')
    options?.abortSignal?.throwIfAborted()
  }

  async function patchConfigRemote(
    client: InferenceServiceProvidersRemoteClient,
    providerId: string,
    config: Record<string, unknown>,
    status: ProviderValidationStatus,
    options?: InferenceServiceProviderServiceOptions,
  ): Promise<InferenceServiceProvider> {
    options?.abortSignal?.throwIfAborted()
    const res = await client.api.v1.providers[':id'].$patch({
      param: { id: providerId },
      json: {
        config,
        validated: status === 'configured',
        validationBypassed: status === 'bypassed',
      },
    }, requestOptions(options))
    if (!res.ok)
      throw new Error('Failed to update provider config')

    const item = await res.json()
    options?.abortSignal?.throwIfAborted()
    return normalize(item)
  }

  return {
    buildLocal,
    fetchRemote,
    createRemote,
    deleteRemote,
    patchConfigRemote,
  }
}

export const inferenceServiceProvidersService = createInferenceServiceProvidersService()
