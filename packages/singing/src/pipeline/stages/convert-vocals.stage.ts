import type { StageResult } from '../../contracts/stage-result'
import type { PipelineContext } from '../context'

import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { createConverter } from '../../adapters/converter/converter-router'
import { ConverterBackendId } from '../../constants/model-backends'
import { PipelineStage } from '../../constants/pipeline-stage'
import { createAudioPath } from '../../domain/value-objects/audio-path'
import { ARTIFACT_NAMES, STAGE_DIRS } from '../../manifests/artifact-layout'

/**
 * Stage: Convert Vocals
 * - Run RVC or Seed-VC via Python worker
 */
export async function convertVocalsStage(
  ctx: PipelineContext,
): Promise<StageResult> {
  const stageDir = join(ctx.jobDir, STAGE_DIRS.convert)
  await mkdir(stageDir, { recursive: true })

  const vocalsPath = join(ctx.jobDir, STAGE_DIRS.separate, ARTIFACT_NAMES.vocals)
  if (!existsSync(vocalsPath)) {
    return {
      stage: PipelineStage.ConvertVocals,
      success: false,
      durationMs: 0,
      artifacts: [],
      error: `Required artifact not found: ${ARTIFACT_NAMES.vocals}`,
    }
  }
  const backendId = ctx.task.request.mode === 'rvc'
    ? ConverterBackendId.RVC
    : ConverterBackendId.SeedVC

  const converter = createConverter(backendId)
  const converterParams: Record<string, unknown> = { ...ctx.task.request.converter }

  const f0Path = join(ctx.jobDir, STAGE_DIRS.pitch, ARTIFACT_NAMES.f0)
  converterParams.f0File = f0Path

  await converter.convert(
    createAudioPath(vocalsPath),
    stageDir,
    converterParams,
    ctx.signal,
  )

  return {
    stage: PipelineStage.ConvertVocals,
    success: true,
    durationMs: 0,
    artifacts: [
      { path: `${STAGE_DIRS.convert}/${ARTIFACT_NAMES.convertedVocals}`, mimeType: 'audio/wav' },
    ],
  }
}
