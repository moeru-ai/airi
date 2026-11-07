import type { LlmUpstream } from '../../domain/llm-router/types'

const KEY_PLACEHOLDER = '{KEY}'

/**
 * Builds the headers one key attempt sends to an upstream.
 *
 * The admin catalog keeps one header list per upstream and writes `{KEY}` where the attempt's key goes.
 * When no header carries the key, Authorization comes from `headerTemplate`, as in configs from before
 * `headers` existed. content-type is dropped; the adapter sets it.
 */
export function upstreamHeaders(upstream: Pick<LlmUpstream, 'headerTemplate' | 'headers'>, apiKey: string): Record<string, string> {
  const result: Record<string, string> = {}
  let sendsKey = false
  for (const [name, value] of Object.entries(upstream.headers ?? {})) {
    const lowerName = name.toLowerCase()
    if (lowerName === 'content-type')
      continue
    sendsKey ||= lowerName === 'authorization' || value.includes(KEY_PLACEHOLDER)
    result[name] = value.replaceAll(KEY_PLACEHOLDER, apiKey)
  }
  if (!sendsKey)
    result.authorization = upstream.headerTemplate.replace(KEY_PLACEHOLDER, apiKey)
  return result
}
