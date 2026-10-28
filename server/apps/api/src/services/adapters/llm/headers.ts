import type { LlmUpstream } from '../../domain/llm-router/types'

const KEY_PLACEHOLDER = '{KEY}'

/**
 * Builds the headers one key attempt sends to an upstream.
 *
 * The admin catalog keeps a single header list per upstream, Authorization included, and writes `{KEY}`
 * where the attempt's key goes. A list without Authorization falls back to `headerTemplate`, which is
 * what configs written before `headers` existed rely on. content-type is dropped here; the adapter sets it.
 */
export function upstreamHeaders(upstream: Pick<LlmUpstream, 'headerTemplate' | 'headers'>, apiKey: string): Record<string, string> {
  const result: Record<string, string> = {}
  let hasAuthorization = false
  for (const [name, value] of Object.entries(upstream.headers ?? {})) {
    const lowerName = name.toLowerCase()
    if (lowerName === 'content-type')
      continue
    if (lowerName === 'authorization')
      hasAuthorization = true
    result[name] = value.replaceAll(KEY_PLACEHOLDER, apiKey)
  }
  if (!hasAuthorization)
    result.authorization = upstream.headerTemplate.replace(KEY_PLACEHOLDER, apiKey)
  return result
}
