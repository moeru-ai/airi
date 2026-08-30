import type { Tool } from '@xsai/shared-chat'

import type { StreamOptions } from '../../types/llm'

/**
 * Builds the compatibility cache key for one connection and model.
 *
 * @example
 * modelRuntimeKey('conn-1', 'gpt-5')
 * // => 'conn-1-gpt-5'
 */
export function modelRuntimeKey(connectionId: string, model: string): string {
  return `${connectionId}-${model}`
}

/**
 * Resolves whether tools are enabled for one runtime cache key.
 */
export function streamOptionsToolsOkByKey(key: string, options?: StreamOptions): boolean {
  if (options?.supportsTools !== undefined)
    return options.supportsTools
  return options?.toolsCompatibility?.get(key) !== false
}

/**
 * Resolves whether content-part arrays are enabled for one runtime cache key.
 */
export function streamOptionsContentArrayOkByKey(key: string, options?: StreamOptions): boolean {
  if (options?.supportsContentArray !== undefined)
    return options.supportsContentArray
  return options?.contentArrayCompatibility?.get(key) !== false
}

/**
 * Resolves StreamOptions tools to a concrete list.
 */
export async function resolveStreamTools(options?: StreamOptions, extra?: Tool[]): Promise<Tool[]> {
  const tools = typeof options?.tools === 'function'
    ? await options.tools()
    : options?.tools
  return [...(extra ?? []), ...(tools ?? [])]
}
