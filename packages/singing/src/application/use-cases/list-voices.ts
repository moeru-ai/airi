import type { ListVoicesResponse } from '../../types/response'

import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Use case: list all registered singing voices.
 *
 * Scans `voice_models/` subdirectories under modelsDir.
 * Each subdirectory named `{voiceId}` containing `{voiceId}.pth` is a voice.
 */
export interface ListVoicesDeps {
  modelsDir: string
}

export async function listVoices(
  deps: ListVoicesDeps,
): Promise<ListVoicesResponse> {
  const voices: ListVoicesResponse['voices'] = []
  const voiceModelsDir = join(deps.modelsDir, 'voice_models')

  try {
    const subdirs = await readdir(voiceModelsDir)
    for (const name of subdirs) {
      const modelPath = join(voiceModelsDir, name, `${name}.pth`)
      if (existsSync(modelPath)) {
        voices.push({
          id: name,
          name,
          hasRvcModel: true,
        })
      }
    }
  }
  catch {
    /* voice_models directory may not exist yet */
  }

  return { voices }
}
