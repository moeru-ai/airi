import type { GenerationRequest } from '@proj-airi/provider-inference'

import type { StreamOptions } from '../types/llm'

/**
 * Request overrides replace configured headers without regard to casing.
 * Authorization keeps the SDK spelling so it also replaces the SDK apiKey default.
 */
export function mergeRequestHeaders(configured: HeadersInit | undefined, overrides: StreamOptions['headers']) {
  const headers = new Headers(configured)
  new Headers(overrides).forEach((value, name) => headers.set(name, value))
  return Object.fromEntries(Array.from(headers, ([name, value]) => [name === 'authorization' ? 'Authorization' : name, value]))
}

/**
 * Native continuation belongs to one provider identity, endpoint, model and conversation.
 * Request credentials and headers do not participate in this persisted scope.
 */
export function createContinuationScope(config: GenerationRequest['config'], options?: StreamOptions) {
  return JSON.stringify([options?.providerId, String(config.baseURL), config.model, options?.requestCorrelation?.conversationId])
}
