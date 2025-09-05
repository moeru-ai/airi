import type { ConfigService } from '../config/service'
import type { AiriPlugin } from '../plugin'
import type { MessageChannel } from '../primitives/message-channel'
import type { ModelProvider, ProviderRequest } from '../primitives/model-provider'

import { PluginRegistry } from '../plugin/registry'

export interface CoreDeps {
  channel?: MessageChannel // Optional, depending on use case
  providers?: Record<string, ModelProvider>
  plugins?: AiriPlugin[]
  config: ConfigService
}

export interface CoreClient {
  init: () => Promise<CoreClient>
  request: (providerId: string, req: ProviderRequest) => Promise<unknown>
  readonly config: ConfigService
  readonly channel?: MessageChannel
}

/**
 * Factory-style CoreClient (composition over class)
 */
export function createCoreClient(
  deps: CoreDeps,
  registry: PluginRegistry = new PluginRegistry(),
): CoreClient {
  const state = { deps, registry }

  const coreClient: CoreClient = {
    async init() {
      // register Provider(s)
      const providers = Object.values(state.deps.providers ?? {})
      for (const provider of providers) {
        state.registry.registerProvider(provider)
      }

      // load plugins
      if (state.deps.plugins?.length) {
        await state.registry.load(state.deps.plugins)
      }
      return coreClient
    },

    async request(providerId: string, req: ProviderRequest) {
      const provider = state.registry.getProvider(providerId)
      if (!provider)
        throw new Error(`Provider not found: ${providerId}`)

      // input processing (pre)
      const processed = await state.registry.applyInput(req)

      // Support both streaming and unary providers
      let result: unknown
      if ('stream' in provider) {
        const chunks: unknown[] = []
        // Streaming to provider
        await provider.stream(processed as ProviderRequest, (c) => {
          chunks.push(c)
        })
        result = chunks
      }
      else {
        // Unary request to provider
        result = await provider.request(processed as ProviderRequest)
      }

      // output processing (post)
      const output = await state.registry.applyOutput(result)
      return output
    },

    // getters
    get config() {
      return state.deps.config
    },
    get channel() {
      return state.deps.channel
    },
  }

  return coreClient
}
