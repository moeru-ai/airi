import type { AudioPath } from '../../domain/value-objects/audio-path'
import type { ConversionResult, ConverterBackend } from './converter.interface'

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { createAudioPath } from '../../domain/value-objects/audio-path'
import { resolveVoiceModelDir } from '../../utils/path'
import { resolveRuntimeEnv } from '../runtime/env-resolver'
import { runProcess } from '../runtime/process-runner'

/**
 * Adapter for RVC (Retrieval-based Voice Conversion).
 * Calls the Python worker using RVC library/API parameters.
 */
export class RvcAdapter implements ConverterBackend {
  readonly id = 'rvc'

  async convert(
    vocals: AudioPath,
    outputDir: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ConversionResult> {
    const env = resolveRuntimeEnv()
    const voiceId = params.voiceId ? String(params.voiceId) : ''
    const voiceModelDir = voiceId
      ? resolveVoiceModelDir(env.voiceModelsDir, voiceId)
      : null

    if (voiceId && !voiceModelDir)
      throw new Error(`Invalid voiceId for voice model lookup: ${voiceId}`)
    const args = [
      '-m',
      'airi_singing_worker.backends.converter.rvc',
      '--input',
      vocals.value,
      '--output-dir',
      outputDir,
      '--models-dir',
      env.modelsDir,
    ]

    if (voiceModelDir) {
      const indexPath = join(voiceModelDir, `${voiceId}.index`)
      if (existsSync(indexPath)) {
        args.push('--index-file', indexPath)
      }
    }

    if (params.voiceId)
      args.push('--voice-id', String(params.voiceId))
    if (params.f0UpKey != null)
      args.push('--f0-up-key', String(params.f0UpKey))
    if (params.indexRate != null)
      args.push('--index-rate', String(params.indexRate))
    if (params.filterRadius != null)
      args.push('--filter-radius', String(params.filterRadius))
    if (params.protect != null)
      args.push('--protect', String(params.protect))
    if (params.rmsMixRate != null)
      args.push('--rms-mix-rate', String(params.rmsMixRate))

    const result = await runProcess(env.pythonPath, args, {
      timeoutMs: 600_000,
      signal,
      env: {
        PYTHONPATH: env.pythonSrcDir,
        RMVPE_MODEL_PATH: join(env.modelsDir, 'rmvpe.pt'),
        HUBERT_MODEL_PATH: join(env.modelsDir, 'hubert_base.pt'),
      },
    })

    if (result.exitCode !== 0) {
      throw new Error(`RVC conversion failed (exit ${result.exitCode}): ${result.stderr.slice(0, 1000)}`)
    }

    return {
      convertedVocals: createAudioPath(join(outputDir, 'converted_vocals.wav')),
    }
  }
}
