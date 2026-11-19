import type { LlmRouteRequest, LlmUpstream } from '../../domain/llm-router/types'

/** Owns wire serialization and capabilities; retries, keys and timeouts belong to the router. */
export interface GenerationAdapter {
  request: (input: {
    upstream: LlmUpstream
    request: LlmRouteRequest
    apiKey: string
  }) => { url: string, init: RequestInit }
  supportsWebSearch: (upstream: LlmUpstream, model: string) => boolean
}
