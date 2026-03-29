import type { StageResult } from '../../contracts/stage-result'
import type { PipelineContext } from '../context'

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { createSeparator } from '../../adapters/separator/separator-registry'
import { PipelineStage } from '../../constants/pipeline-stage'
import { createAudioPath } from '../../domain/value-objects/audio-path'
import { ARTIFACT_NAMES, STAGE_DIRS } from '../../manifests/artifact-layout'

/**
 * Stage: Separate Vocals
 * - Run MelBand-RoFormer or BS-RoFormer via Python worker
 * - Produce vocals.wav and instrumental.wav
 */
export async function separateVocalsStage(
  ctx: PipelineContext,
): Promise<StageResult> {
  const stageDir = join(ctx.jobDir, STAGE_DIRS.separate)
  await mkdir(stageDir, { recursive: true })

  const sourcePath = join(ctx.jobDir, STAGE_DIRS.prep, ARTIFACT_NAMES.source)
  const separator = createSeparator(
    ctx.task.request.separator.backend,
    ctx.task.request.separator.model,
  )

  await separator.separate(
    createAudioPath(sourcePath),
    stageDir,
    ctx.signal,
  )

  return {
    stage: PipelineStage.SeparateVocals,
    success: true,
    durationMs: 0,
    artifacts: [
      { path: `${STAGE_DIRS.separate}/${ARTIFACT_NAMES.vocals}`, mimeType: 'audio/wav' },
      { path: `${STAGE_DIRS.separate}/${ARTIFACT_NAMES.instrumental}`, mimeType: 'audio/wav' },
    ],
  }
}
