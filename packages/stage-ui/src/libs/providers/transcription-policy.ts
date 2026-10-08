import { SHERPAW_TRANSCRIPTION_PROVIDER_ID } from '@proj-airi/provider-inference'

/** Steam ships local ASR models and does not offer remote transcription. */
export function usesSteamLocalAsr(): boolean {
  return import.meta.env.VITE_DISTRIBUTION === 'steam'
}

/** Also guards legacy selections and callers that already hold a provider instance. */
export function isTranscriptionProviderAllowed(providerId: string): boolean {
  return !usesSteamLocalAsr() || providerId === SHERPAW_TRANSCRIPTION_PROVIDER_ID
}
