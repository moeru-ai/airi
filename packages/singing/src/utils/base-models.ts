import type { BaseModelCategory, BaseModelInfo } from '../types/response'

import process from 'node:process'

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

// NOTICE: Default is huggingface.co (Xet Hub CDN, generally fast globally).
// Set HF_MIRROR=https://hf-mirror.com if huggingface.co is blocked in your region.
const HF_BASE = process.env.HF_MIRROR ?? 'https://huggingface.co'

function hf(path: string): string {
  return `${HF_BASE}/${path}`
}

export const BASE_MODELS: BaseModelDefinition[] = [
  {
    id: 'rmvpe',
    name: 'RMVPE',
    url: hf('lj1995/VoiceConversionWebUI/resolve/main/rmvpe.pt'),
    filename: 'rmvpe.pt',
    sizeBytes: 181_184_272,
    category: 'pitch',
    description: 'Pitch extraction (F0) for voice conversion',
  },
  {
    id: 'hubert_base',
    name: 'HuBERT Base',
    url: hf('lj1995/VoiceConversionWebUI/resolve/main/hubert_base.pt'),
    filename: 'hubert_base.pt',
    sizeBytes: 189_507_909,
    category: 'encoder',
    description: 'Content feature encoder for RVC',
  },
  {
    id: 'melband_roformer_ckpt',
    name: 'MelBand-RoFormer (weights)',
    url: hf('KimberleyJSN/melbandroformer/resolve/main/MelBandRoformer.ckpt'),
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
    id: 'melband_roformer_karaoke_ckpt',
    name: 'MelBand-RoFormer Karaoke (weights)',
    url: hf('jarredou/aufr33-viperx-karaoke-melroformer-model/resolve/main/mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt'),
    filename: 'mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt',
    subdir: 'separation',
    sizeBytes: 913_096_801,
    category: 'separation',
    description: 'Lead vocal / backing vocal isolation model weights (Karaoke)',
  },
  {
    id: 'melband_roformer_karaoke_config',
    name: 'MelBand-RoFormer Karaoke (config)',
    url: hf('jarredou/aufr33-viperx-karaoke-melroformer-model/resolve/main/config_mel_band_roformer_karaoke.yaml'),
    filename: 'config_mel_band_roformer_karaoke.yaml',
    subdir: 'separation',
    sizeBytes: 1_722,
    category: 'separation',
    description: 'Architecture config matching the Karaoke separation weights',
  },
  {
    id: 'rvc_pretrained_g',
    name: 'RVC v2 Generator (f0, 40kHz)',
    url: hf('lj1995/VoiceConversionWebUI/resolve/main/pretrained_v2/f0G40k.pth'),
    filename: 'f0G40k.pth',
    subdir: 'pretrained_v2',
    sizeBytes: 73_106_273,
    category: 'pretrained',
    description: 'Pretrained generator for training new voice models',
  },
  {
    id: 'rvc_pretrained_d',
    name: 'RVC v2 Discriminator (f0, 40kHz)',
    url: hf('lj1995/VoiceConversionWebUI/resolve/main/pretrained_v2/f0D40k.pth'),
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
