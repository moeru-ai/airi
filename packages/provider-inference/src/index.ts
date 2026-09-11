import { portableProviderDefinitions } from './providers'
import { createProviderRegistry } from './providers/registry'

const providerRegistry = createProviderRegistry(portableProviderDefinitions)

/** IDs of the provider definitions included in the portable registry. */
export type PortableProviderId = typeof portableProviderDefinitions[number]['id']

/** Returns the portable definition with this stable provider id. */
export function getDefinedProvider(id: PortableProviderId) {
  return providerRegistry.get(id)
}

/** Returns portable definitions in their deterministic display order. */
export function listProviders() {
  return providerRegistry.list()
}

export { portableProviderDefinitions }
export { createWebSpeechAPIProvider, streamWebSpeechAPITranscription } from './providers/local/browser-web-speech-api'
export * from './providers/registry'
export * from './types'
export * from './validators'
