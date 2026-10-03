import { cloneDeep } from 'es-toolkit'

/**
 * Creates a plain provider configuration for a synchronized store action.
 *
 * Vue can wrap the configuration and its nested values in reactive proxies.
 * BroadcastChannel cannot clone these proxies when a follower calls the action.
 *
 * @example
 * toProviderConfigSnapshot(reactive({ apiKey: 'key', voiceSettings: { speed: 1 } }))
 * // => { apiKey: 'key', voiceSettings: { speed: 1 } }
 */
export function toProviderConfigSnapshot(config: Record<string, unknown>): Record<string, unknown> {
  return cloneDeep(config)
}
