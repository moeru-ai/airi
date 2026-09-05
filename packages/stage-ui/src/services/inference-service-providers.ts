export interface ProviderReplicaRow {
  id: string
  definitionId: string
  config: Record<string, unknown>
  updatedAt: string
  deletedAt: string | null
}

interface RequestOptions {
  init: { signal: AbortSignal }
}

interface RemoteResponse<T> {
  json: () => Promise<T>
  ok: boolean
  status: number
}

/**
 * Remote provider replica API used by the provider config store.
 */
export interface InferenceServiceProvidersRemoteClient {
  api: {
    v1: {
      providers: {
        '$get': (params?: undefined, options?: RequestOptions) => Promise<RemoteResponse<unknown[]>>
        ':id': {
          $put: (params: {
            json: {
              definitionId: string
              config: Record<string, unknown>
            }
            param: { id: string }
          }, options?: RequestOptions) => Promise<RemoteResponse<unknown>>
          $delete: (params: {
            param: { id: string }
          }, options?: RequestOptions) => Promise<{ ok: boolean, status: number }>
        }
      }
    }
  }
}

function asReplicaRow(value: unknown): ProviderReplicaRow {
  const item = value as {
    id: string
    definitionId: string
    config?: Record<string, unknown>
    updatedAt: string
    deletedAt?: string | null
  }
  return {
    id: item.id,
    definitionId: item.definitionId,
    config: item.config ?? {},
    updatedAt: item.updatedAt,
    deletedAt: item.deletedAt ?? null,
  }
}

export interface InferenceServiceProvidersService {
  listRemote: (client: InferenceServiceProvidersRemoteClient) => Promise<ProviderReplicaRow[]>
  upsertRemote: (
    client: InferenceServiceProvidersRemoteClient,
    provider: { id: string, definitionId: string, config: Record<string, unknown> },
  ) => Promise<ProviderReplicaRow>
  deleteRemote: (
    client: InferenceServiceProvidersRemoteClient,
    providerId: string,
  ) => Promise<void>
}

export function createInferenceServiceProvidersService(): InferenceServiceProvidersService {
  async function listRemote(client: InferenceServiceProvidersRemoteClient): Promise<ProviderReplicaRow[]> {
    const res = await client.api.v1.providers.$get()
    if (!res.ok)
      throw new Error('Failed to fetch providers')

    const data = await res.json()
    return data.map(item => asReplicaRow(item))
  }

  async function upsertRemote(
    client: InferenceServiceProvidersRemoteClient,
    provider: { id: string, definitionId: string, config: Record<string, unknown> },
  ): Promise<ProviderReplicaRow> {
    const res = await client.api.v1.providers[':id'].$put({
      param: { id: provider.id },
      json: {
        definitionId: provider.definitionId,
        config: provider.config,
      },
    })
    if (!res.ok)
      throw new Error('Failed to update provider config')

    const item = await res.json()
    return asReplicaRow(item)
  }

  async function deleteRemote(
    client: InferenceServiceProvidersRemoteClient,
    providerId: string,
  ): Promise<void> {
    const res = await client.api.v1.providers[':id'].$delete({
      param: { id: providerId },
    })
    if (res.status === 404)
      return
    if (!res.ok)
      throw new Error('Failed to remove provider')
  }

  return {
    listRemote,
    upsertRemote,
    deleteRemote,
  }
}

export const inferenceServiceProvidersService = createInferenceServiceProvidersService()
