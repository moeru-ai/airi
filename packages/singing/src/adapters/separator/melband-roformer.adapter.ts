import type { AudioPath } from '../../domain/value-objects/audio-path'
import type { SeparationResult, SeparatorBackend } from './separator.interface'

import { join } from 'node:path'

import { createAudioPath } from '../../domain/value-objects/audio-path'
import { resolveRuntimeEnv } from '../runtime/env-resolver'
import { runProcess } from '../runtime/process-runner'

/**
 * Adapter for openmirlab/melband-roformer-infer.
 * Calls the Python CLI to run Mel-Band RoFormer vocal separation.
 */
export class MelBandRoFormerAdapter implements SeparatorBackend {
  readonly id = 'melband'

  constructor(private readonly modelName: string = 'melband-roformer-kim-vocals') {}

  async separate(input: AudioPath, outputDir: string, signal?: AbortSignal): Promise<SeparationResult> {
    const env = resolveRuntimeEnv()
    const separationDir = join(env.modelsDir, 'separation')
    const result = await runProcess(env.pythonPath, [
      '-m',
      'airi_singing_worker.backends.separator.melband_roformer',
      '--input',
      input.value,
      '--output-dir',
      outputDir,
      '--model',
      this.modelName,
    ], {
      timeoutMs: 600_000,
      signal,
      env: {
        PYTHONPATH: env.pythonSrcDir,
        MELBAND_CKPT_PATH: join(separationDir, 'MelBandRoformer.ckpt'),
        MELBAND_CONFIG_PATH: join(separationDir, 'config_vocals_mel_band_roformer_kj.yaml'),
      },
    })

    if (result.exitCode !== 0) {
      throw new Error(`MelBand-RoFormer separation failed (exit ${result.exitCode}): ${result.stderr.slice(0, 1000)}`)
    }

    return {
      vocals: createAudioPath(join(outputDir, 'vocals.wav')),
      instrumental: createAudioPath(join(outputDir, 'instrumental.wav')),
    }
  }
}
