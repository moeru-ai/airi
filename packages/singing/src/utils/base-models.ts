import type { BaseModelCategory, BaseModelInfo } from '../types/response'

import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface BaseModelDefinition {
  id: string
  name: string
  url: string
  filename: string
  subdir?: string
  sizeBytes: number
  category: BaseModelCategory
  description: string
}

export const BASE_MODELS: BaseModelDefinition[] = [
  {
    id: 'rmvpe',
    name: 'RMVPE',
    url: 'https://hf-mirror.com/lj1995/VoiceConversionWebUI/resolve/main/rmvpe.pt',
    filename: 'rmvpe.pt',
    sizeBytes: 181_184_272,
    category: 'pitch',
    description: 'Pitch extraction (F0) for voice conversion',
  },
  {
    id: 'hubert_base',
    name: 'HuBERT Base',
    url: 'https://hf-mirror.com/lj1995/VoiceConversionWebUI/resolve/main/hubert_base.pt',
    filename: 'hubert_base.pt',
    sizeBytes: 189_507_909,
    category: 'encoder',
    description: 'Content feature encoder for RVC',
  },
  {
    id: 'melband_roformer_ckpt',
    name: 'MelBand-RoFormer (weights)',
    url: 'https://hf-mirror.com/KimberleyJSN/melbandroformer/resolve/main/MelBandRoformer.ckpt',
    filename: 'MelBandRoformer.ckpt',
    subdir: 'separation',
    sizeBytes: 913_106_900,
    category: 'separation',
    description: 'Vocal / instrumental separation model weights',
  },
  {
    id: 'melband_roformer_config',
    name: 'MelBand-RoFormer (config)',
    url: 'https://raw.githubusercontent.com/ZFTurbo/Music-Source-Separation-Training/main/configs/KimberleyJensen/config_vocals_mel_band_roformer_kj.yaml',
    filename: 'config_vocals_mel_band_roformer_kj.yaml',
    subdir: 'separation',
    sizeBytes: 1_721,
    category: 'separation',
    description: 'Architecture configuration matching the separation weights',
  },
  {
    id: 'rvc_pretrained_g',
    name: 'RVC v2 Generator (f0, 40kHz)',
    url: 'https://hf-mirror.com/lj1995/VoiceConversionWebUI/resolve/main/pretrained_v2/f0G40k.pth',
    filename: 'f0G40k.pth',
    subdir: 'pretrained_v2',
    sizeBytes: 73_106_273,
    category: 'pretrained',
    description: 'Pretrained generator for training new voice models',
  },
  {
    id: 'rvc_pretrained_d',
    name: 'RVC v2 Discriminator (f0, 40kHz)',
    url: 'https://hf-mirror.com/lj1995/VoiceConversionWebUI/resolve/main/pretrained_v2/f0D40k.pth',
    filename: 'f0D40k.pth',
    subdir: 'pretrained_v2',
    sizeBytes: 142_875_703,
    category: 'pretrained',
    description: 'Pretrained discriminator for training new voice models',
  },
]

/**
 * Inspect the standard singing runtime model inventory and report which files
 * are already present with a plausible size.
 */
export function checkBaseModels(modelsDir: string): BaseModelInfo[] {
  return BASE_MODELS.map((model) => {
    const dir = model.subdir ? join(modelsDir, model.subdir) : modelsDir
    const filepath = join(dir, model.filename)
    let fileExists = false
    let actualSize = 0

    if (existsSync(filepath)) {
      actualSize = statSync(filepath).size
      fileExists = model.sizeBytes < 10_000
        ? actualSize > 0
        : actualSize >= model.sizeBytes * 0.9
    }

    return {
      id: model.id,
      name: model.name,
      category: model.category,
      description: model.description,
      exists: fileExists,
      sizeBytes: model.sizeBytes,
      actualSize,
    }
  })
}
