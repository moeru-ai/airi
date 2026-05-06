import type { AudioPath } from '../../domain/value-objects/audio-path'

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { createAudioPath } from '../../domain/value-objects/audio-path'
import { resolveRuntimeEnv } from '../runtime/env-resolver'
import { runProcess } from '../runtime/process-runner'

export interface LeadIsolationResult {
  leadVocals: AudioPath
  backingVocals: AudioPath
}

const KARAOKE_CKPT_FILENAME = 'mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt'
const KARAOKE_CONFIG_FILENAME = 'config_mel_band_roformer_karaoke.yaml'

/**
 * Adapter for lead vocal isolation using MelBand-RoFormer Karaoke model.
 *
 * Takes mixed vocals (output of Pass 1 separation) and splits them into
 * lead_vocals + backing_vocals (Pass 2).
 */
export class LeadVocalIsolatorAdapter {
  readonly id = 'lead-isolator'

  async isolate(mixedVocals: AudioPath, outputDir: string, signal?: AbortSignal): Promise<LeadIsolationResult> {
    const env = resolveRuntimeEnv()
    const separationDir = join(env.modelsDir, 'separation')

    const karaokeCheckpoint = join(separationDir, KARAOKE_CKPT_FILENAME)
    const karaokeConfig = join(separationDir, KARAOKE_CONFIG_FILENAME)

    if (!existsSync(karaokeCheckpoint)) {
      throw new Error(
        `Karaoke model checkpoint not found: ${karaokeCheckpoint}. `
        + `Run: pnpm -F @proj-airi/singing download-models`,
      )
    }
    if (!existsSync(karaokeConfig)) {
      throw new Error(
        `Karaoke model config not found: ${karaokeConfig}. `
        + `Run: pnpm -F @proj-airi/singing download-models`,
      )
    }

    const result = await runProcess(env.pythonPath, [
      '-m',
      'airi_singing_worker.backends.separator.lead_vocal_isolator',
      '--input',
      mixedVocals.value,
      '--output-dir',
      outputDir,
    ], {
      timeoutMs: 600_000,
      signal,
      env: {
        PYTHONPATH: env.pythonSrcDir,
        KARAOKE_CKPT_PATH: karaokeCheckpoint,
        KARAOKE_CONFIG_PATH: karaokeConfig,
      },
    })

    if (result.exitCode !== 0) {
      throw new Error(`Lead vocal isolation failed (exit ${result.exitCode}): ${result.stderr.slice(0, 1000)}`)
    }

    return {
      leadVocals: createAudioPath(join(outputDir, 'lead_vocals.wav')),
      backingVocals: createAudioPath(join(outputDir, 'backing_vocals.wav')),
    }
  }
}
