import type { ListVoicesResponse, VoiceInfo } from '../../types/response'

import { SingingError, SingingErrorCode } from '../../contracts/error'
import { listVoices } from '../use-cases/list-voices'

/**
 * Application service for managing registered singing voices.
 */
export interface VoiceRegistryService {
  list: () => Promise<ListVoicesResponse>
  get: (voiceId: string) => Promise<VoiceInfo | null>
  /** @experimental Not yet implemented. Add model files manually to voice_models/{voiceId}/. */
  register: (voice: Omit<VoiceInfo, 'id'>) => Promise<VoiceInfo>
}

/**
 * Create a VoiceRegistryService with the given models directory.
 */
export function createVoiceRegistryService(modelsDir: string): VoiceRegistryService {
  return {
    list: () => listVoices({ modelsDir }),
    get: async (voiceId) => {
      const { voices } = await listVoices({ modelsDir })
      return voices.find(v => v.id === voiceId) ?? null
    },
    register: async (_voice) => {
      throw new SingingError(
        SingingErrorCode.InvalidInput,
        'Voice registration not yet implemented — add model files to models/voice_models/{voiceId}/ directory',
      )
    },
  }
}
