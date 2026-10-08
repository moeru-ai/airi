import { SHERPAW_TRANSCRIPTION_PROVIDER_ID } from '@proj-airi/provider-inference'
import { isSteamDistribution } from '@proj-airi/stage-shared'

import { OFFICIAL_CHAT_PROVIDER_ID, OFFICIAL_SPEECH_PROVIDER_ID, OFFICIAL_VISION_PROVIDER_ID } from './providers/official/constants'

const steamProviders = new Set<string>([
  OFFICIAL_CHAT_PROVIDER_ID,
  OFFICIAL_SPEECH_PROVIDER_ID,
  OFFICIAL_VISION_PROVIDER_ID,
  SHERPAW_TRANSCRIPTION_PROVIDER_ID,
  'speech-noop',
])

/** Keeps discovery, saved routes, and execution on the same Steam service policy. */
export function isProviderAllowedInDistribution(definitionId: string): boolean {
  return !isSteamDistribution() || steamProviders.has(definitionId)
}
