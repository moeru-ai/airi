import type {
  MemoryPatchPullClient,
  MemoryPatchPullConfig,
  MemoryPatchPullStatus,
} from './sync-types'
import type { MemoryRepositoryScope, MemorySyncStateRecord } from './types'

export interface MemoryPatchPullRuntime {
  client: MemoryPatchPullClient
  getStatus: () => MemoryPatchPullStatus
}

interface CreateMemoryPatchPullRuntimeOptions {
  config: MemoryPatchPullConfig
  fetchImpl?: typeof fetch
}

/**
 * Creates the runtime adapter for pulling incremental memory patches.
 *
 * Use when:
 * - The desktop sync runtime wants a concrete patch-pull client
 * - App startup must degrade cleanly when remote patch config is absent
 *
 * Expects:
 * - `config` is already resolved from one centralized runtime config source
 * - `fetchImpl` behaves like the standard Fetch API
 *
 * Returns:
 * - An active patch-pull runtime, or a disabled no-op runtime with an explicit status
 */
export function createMemoryPatchPullRuntime(options: CreateMemoryPatchPullRuntimeOptions): MemoryPatchPullRuntime {
  const fetchImpl = options.fetchImpl ?? fetch

  if (!options.config.enabled) {
    return {
      client: {
        async fetchMemoryPatch() {
          return null
        },
      },
      getStatus: () => ({
        mode: 'disabled',
        reason: 'memory patch pull is disabled',
      }),
    }
  }

  if (!options.config.endpointUrl || !options.config.authToken) {
    return {
      client: {
        async fetchMemoryPatch() {
          return null
        },
      },
      getStatus: () => ({
        mode: 'disabled',
        reason: 'memory patch pull is missing endpoint or auth token',
      }),
    }
  }

  return {
    client: {
      async fetchMemoryPatch(scope: MemoryRepositoryScope, state: MemorySyncStateRecord | null) {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), options.config.requestTimeoutMs)

        try {
          const response = await fetchImpl(options.config.endpointUrl!, {
            body: JSON.stringify({
              scope,
              state,
            }),
            headers: {
              'Authorization': `Bearer ${options.config.authToken}`,
              'Content-Type': 'application/json',
            },
            method: 'POST',
            signal: controller.signal,
          })

          if (response.status === 204) {
            return null
          }

          if (!response.ok) {
            throw new Error(`memory patch pull failed (${response.status})`)
          }

          return await response.json()
        }
        finally {
          clearTimeout(timeoutId)
        }
      },
    },
    getStatus: () => ({
      endpointUrl: options.config.endpointUrl,
      mode: 'active',
    }),
  }
}
