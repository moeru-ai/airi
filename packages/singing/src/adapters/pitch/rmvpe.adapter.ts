import type { AudioPath } from '../../domain/value-objects/audio-path'
import type { PitchExtractorBackend, PitchResult } from './pitch-extractor.interface'

import { join } from 'node:path'

import { resolveRuntimeEnv } from '../runtime/env-resolver'
import { runProcess } from '../runtime/process-runner'

/**
 * Adapter for RMVPE pitch extraction.
 * Calls the Python worker with rmvpe backend.
 */
export class RmvpeAdapter implements PitchExtractorBackend {
  readonly id = 'rmvpe'

  async extract(input: AudioPath, outputDir: string, signal?: AbortSignal): Promise<PitchResult> {
    const env = resolveRuntimeEnv()
    const result = await runProcess(env.pythonPath, [
      '-m',
      'airi_singing_worker.backends.pitch.rmvpe',
      '--input',
      input.value,
      '--output-dir',
      outputDir,
    ], { timeoutMs: 300_000, signal, env: { PYTHONPATH: env.pythonSrcDir } })

    if (result.exitCode !== 0) {
      throw new Error(`RMVPE pitch extraction failed (exit ${result.exitCode}): ${result.stderr.slice(0, 1000)}`)
    }

    return {
      f0Path: join(outputDir, 'f0.npy'),
    }
  }
}
