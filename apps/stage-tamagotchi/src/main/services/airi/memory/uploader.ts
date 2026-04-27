import type {
  MemoryRawTurnUploadClient,
  MemoryRawTurnUploaderConfig,
  MemoryRawTurnUploaderStatus,
} from './sync-types'

export interface MemoryRawTurnUploadRuntime {
  client: MemoryRawTurnUploadClient
  getStatus: () => MemoryRawTurnUploaderStatus
}

interface CreateMemoryRawTurnUploadRuntimeOptions {
  config: MemoryRawTurnUploaderConfig
  fetchImpl?: typeof fetch
}

/**
 * Creates the runtime upload adapter for raw-turn sync.
 *
 * Use when:
 * - The raw-turn sync agent needs a concrete upload client for desktop runtime
 * - App startup must degrade cleanly when upload configuration is absent
 *
 * Expects:
 * - `config` is already resolved from one centralized config source
 * - `fetchImpl` behaves like the standard Fetch API
 *
 * Returns:
 * - An active uploader runtime, or a disabled no-op runtime with an explicit status
 */
export function createMemoryRawTurnUploadRuntime(options: CreateMemoryRawTurnUploadRuntimeOptions): MemoryRawTurnUploadRuntime {
  const fetchImpl = options.fetchImpl ?? fetch

  if (!options.config.enabled) {
    return {
      client: {
        async uploadRawTurns() {
        },
      },
      getStatus: () => ({
        mode: 'disabled',
        reason: 'memory sync upload is disabled',
      }),
    }
  }

  if (!options.config.endpointUrl || !options.config.authToken) {
    return {
      client: {
        async uploadRawTurns() {
        },
      },
      getStatus: () => ({
        mode: 'disabled',
        reason: 'memory sync upload is missing endpoint or auth token',
      }),
    }
  }

  return {
    client: {
      async uploadRawTurns(request) {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), options.config.requestTimeoutMs)

        try {
          const response = await fetchImpl(options.config.endpointUrl!, {
            body: JSON.stringify({
              scope: request.scope,
              trigger: request.trigger,
              turns: request.turns,
            }),
            headers: {
              'Authorization': `Bearer ${options.config.authToken}`,
              'Content-Type': 'application/json',
            },
            method: 'POST',
            signal: controller.signal,
          })

          if (!response.ok) {
            throw new Error(`memory raw-turn upload failed (${response.status})`)
          }
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
