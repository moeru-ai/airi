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
 * Applies DSP chain: Noise Gate → High-frequency Augmentation → De-essing
 */
export async function postprocessVocalsStage(
  ctx: PipelineContext,
): Promise<StageResult> {
  const convertedPath = join(ctx.jobDir, STAGE_DIRS.convert, ARTIFACT_NAMES.convertedVocals)
  const sourceVocalsPath = join(ctx.jobDir, STAGE_DIRS.separate, ARTIFACT_NAMES.vocals)

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
