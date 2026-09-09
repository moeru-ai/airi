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
 * Native continuation belongs to one provider account, endpoint, model and conversation.
 * Header credentials enter persisted history only as a digest.
 */
export async function createContinuationScope(config: GenerationRequest['config'], options?: StreamOptions) {
  const headers = new Headers(mergeRequestHeaders(config.headers, options?.headers))
  if (!headers.has('authorization') && config.apiKey !== undefined)
    headers.set('authorization', `Bearer ${config.apiKey}`)
  // Product-signal headers identify individual requests, not provider accounts.
  // Their values change between rounds and must not invalidate native continuation.
  // Producer: stage-ui/src/libs/product-signals/headers.ts.
  headers.delete('x-airi-session-id')
  headers.delete('x-airi-round-id')
  headers.delete('x-airi-app-surface')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(Array.from(headers))))
  const credentials = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  return JSON.stringify([options?.providerId, String(config.baseURL), config.model, options?.requestCorrelation?.conversationId, credentials])
}
