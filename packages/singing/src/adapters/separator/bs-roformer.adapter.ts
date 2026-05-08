import type { AudioPath } from '../../domain/value-objects/audio-path'
import type { SeparationResult, SeparatorBackend } from './separator.interface'

import { join } from 'node:path'

import { createAudioPath } from '../../domain/value-objects/audio-path'
import { resolveRuntimeEnv } from '../runtime/env-resolver'
import { runProcess } from '../runtime/process-runner'

/**
 * Adapter for openmirlab/bs-roformer-infer.
 * Supports multi-stem (6-stem) separation mode.
 */
export class BSRoFormerAdapter implements SeparatorBackend {
  readonly id = 'bs_roformer'

  constructor(private readonly modelName: string = 'BS-RoFormer-SW') {}

  async separate(input: AudioPath, outputDir: string, signal?: AbortSignal): Promise<SeparationResult> {
    const env = resolveRuntimeEnv()
    const result = await runProcess(env.pythonPath, [
      '-m',
      'airi_singing_worker.backends.separator.bs_roformer',
      '--input',
      input.value,
      '--output-dir',
      outputDir,
      '--model',
      this.modelName,
    ], { timeoutMs: 600_000, signal, env: { PYTHONPATH: env.pythonSrcDir } })

    if (result.exitCode !== 0) {
      throw new Error(`BS-RoFormer separation failed (exit ${result.exitCode}): ${result.stderr.slice(0, 1000)}`)
    }

    return {
      vocals: createAudioPath(join(outputDir, 'vocals.wav')),
      instrumental: createAudioPath(join(outputDir, 'instrumental.wav')),
    }
  }
}
