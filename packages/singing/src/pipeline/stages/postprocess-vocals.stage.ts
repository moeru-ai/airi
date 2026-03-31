import type { StageResult } from '../../contracts/stage-result'
import type { PipelineContext } from '../context'

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { runProcess } from '../../adapters/runtime/process-runner'
import { PipelineStage } from '../../constants/pipeline-stage'
import { ARTIFACT_NAMES, STAGE_DIRS } from '../../manifests/artifact-layout'
import { resolveRuntimeEnv } from '../../utils/resolve-env'

/**
 * Stage: Postprocess Vocals
 * Applies DSP chain: Noise Gate → Spectral Denoise → HF Balance → De-essing
 *
 * Prefers isolated lead_vocals.wav as HF reference when available because the
 * mixed vocals.wav includes backing vocals whose spectral profile differs from
 * the converted lead, leading to incorrect clamp/restore decisions.
 */
export async function postprocessVocalsStage(
  ctx: PipelineContext,
): Promise<StageResult> {
  const convertedPath = join(ctx.jobDir, STAGE_DIRS.convert, ARTIFACT_NAMES.convertedVocals)

  if (!existsSync(convertedPath)) {
    return {
      stage: PipelineStage.PostprocessVocals,
      success: true,
      durationMs: 0,
      artifacts: [
        { path: `${STAGE_DIRS.convert}/${ARTIFACT_NAMES.convertedVocals}`, mimeType: 'audio/wav' },
      ],
    }
  }

  const leadVocalsPath = join(ctx.jobDir, STAGE_DIRS.isolate, ARTIFACT_NAMES.leadVocals)
  const mixedVocalsPath = join(ctx.jobDir, STAGE_DIRS.separate, ARTIFACT_NAMES.vocals)
  const sourceVocalsPath = existsSync(leadVocalsPath) ? leadVocalsPath : mixedVocalsPath

  const env = resolveRuntimeEnv()
  const outputPath = convertedPath

  const args = [
    '-m',
    'airi_singing_worker.backends.postprocessor.vocal_postprocess',
    '--converted',
    convertedPath,
    '--source-vocals',
    sourceVocalsPath,
    '--output',
    outputPath,
    '--noise-gate-threshold',
    '-54',
    '--spectral-denoise-strength',
    '0.35',
    '--hf-max-ratio',
    '1.5',
    '--hf-mix-ratio',
    '0.10',
    '--deessing-threshold',
    '-14',
  ]

  const result = await runProcess(env.pythonPath, args, {
    timeoutMs: 300_000,
    signal: ctx.signal,
    env: {
      PYTHONPATH: env.pythonSrcDir,
    },
  })

  if (result.exitCode !== 0) {
    return {
      stage: PipelineStage.PostprocessVocals,
      success: false,
      durationMs: 0,
      artifacts: [],
      error: `Post-processing failed (exit ${result.exitCode}): ${result.stderr.slice(0, 500)}`,
    }
  }

  return {
    stage: PipelineStage.PostprocessVocals,
    success: true,
    durationMs: 0,
    artifacts: [
      { path: `${STAGE_DIRS.convert}/${ARTIFACT_NAMES.convertedVocals}`, mimeType: 'audio/wav' },
    ],
  }
}
