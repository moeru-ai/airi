import type { GenerationRequest } from '@proj-airi/provider-inference'

import type { StreamOptions } from '../types/llm'

/** Settings for one model request. */
export type ResolvedStep = Awaited<ReturnType<NonNullable<StreamOptions['resolveStep']>>>

/** Removes provider fields that the next request no longer defines. */
export function replaceProviderConfig(target: object, previousKeys: readonly string[], next: object): string[] {
  for (const key of previousKeys) {
    if (!Object.hasOwn(next, key))
      Reflect.deleteProperty(target, key)
  }
  Object.assign(target, next)
  return Object.keys(next)
}

/** Builds a compatibility-cache key from the same configuration used by the request. */
export function modelKey(model: string, { protocol, config }: GenerationRequest): string {
  return `${protocol === 'responses' ? 'responses:' : ''}${config.baseURL}-${model}`
}

/** Applies a caller override before the learned tool compatibility for this exact model request. */
export function supportsTools(model: string, request: GenerationRequest, options?: StreamOptions): boolean {
  return options?.supportsTools ?? (options?.toolsCompatibility?.get(modelKey(model, request)) !== false)
}

/** Applies a caller override before the learned Chat content compatibility for this exact model request. */
export function supportsContentArray(model: string, request: GenerationRequest, options?: StreamOptions): boolean {
  return options?.supportsContentArray ?? (options?.contentArrayCompatibility?.get(modelKey(model, request)) !== false)
}

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
