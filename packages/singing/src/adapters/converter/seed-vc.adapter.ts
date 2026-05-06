import type { AudioPath } from '../../domain/value-objects/audio-path'
import type { ConversionResult, ConverterBackend } from './converter.interface'

import { join } from 'node:path'

import { createAudioPath } from '../../domain/value-objects/audio-path'
import { resolveRuntimeEnv } from '../runtime/env-resolver'
import { runProcess } from '../runtime/process-runner'

/**
 * Adapter for Seed-VC (zero-shot singing voice conversion).
 * GPL-3.0 licensed — kept isolated as an optional backend.
 */
export class SeedVcAdapter implements ConverterBackend {
  readonly id = 'seedvc'

  async convert(
    vocals: AudioPath,
    outputDir: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ConversionResult> {
    const env = resolveRuntimeEnv()
    const args = [
      '-m',
      'airi_singing_worker.backends.converter.seed_vc',
      '--input',
      vocals.value,
      '--output-dir',
      outputDir,
    ]

    if (params.referenceUri)
      args.push('--reference', String(params.referenceUri))
    if (params.checkpoint)
      args.push('--checkpoint', String(params.checkpoint))
    if (params.diffusionSteps != null)
      args.push('--diffusion-steps', String(params.diffusionSteps))
    if (params.f0Condition != null)
      args.push('--f0-condition', String(params.f0Condition))
    if (params.autoF0Adjust != null)
      args.push('--auto-f0-adjust', String(params.autoF0Adjust))
    if (params.semiToneShift != null)
      args.push('--semi-tone-shift', String(params.semiToneShift))

    const result = await runProcess(env.pythonPath, args, { timeoutMs: 600_000, signal, env: { PYTHONPATH: env.pythonSrcDir } })

    if (result.exitCode !== 0) {
      throw new Error(`Seed-VC conversion failed (exit ${result.exitCode}): ${result.stderr.slice(0, 1000)}`)
    }

    return {
      convertedVocals: createAudioPath(join(outputDir, 'converted_vocals.wav')),
    }
  }
}
