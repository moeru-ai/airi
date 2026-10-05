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
export * from './generation'
export { createWebSpeechAPIProvider, streamWebSpeechAPITranscription } from './providers/local/browser-web-speech-api'
export { createSherpawTranscriptionDefinition, executeSherpawStream, SHERPAW_TRANSCRIPTION_PROVIDER_ID } from './providers/local/sherpaw-transcription'
export type { SherpawModelResource, SherpawTranscriptionHost } from './providers/local/sherpaw-transcription'
export * from './providers/local/sherpaw-transcription/models'
export * from './providers/registry'
export * from './types'
export * from './validators'
