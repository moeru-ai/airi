import type { StageResult } from '../../contracts/stage-result'
import type { PipelineContext } from '../context'

import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { LeadVocalIsolatorAdapter } from '../../adapters/separator/lead-isolator.adapter'
import { PipelineStage } from '../../constants/pipeline-stage'
import { createAudioPath } from '../../domain/value-objects/audio-path'
import { ARTIFACT_NAMES, STAGE_DIRS } from '../../manifests/artifact-layout'

/**
 * Stage: Isolate Lead Vocal (Two-Pass separation, Pass 2)
 *
 * Takes the mixed vocals from Pass 1 and splits them into
 * lead_vocals (single voice) + backing_vocals (harmonies/chorus)
 * using the MelBand-RoFormer Karaoke model.
 *
 * Skipped when isolateLeadVocal is explicitly false.
 */
export async function isolateLeadVocalStage(
  ctx: PipelineContext,
): Promise<StageResult> {
  const isolateEnabled = (ctx.task.request as any).separator?.isolateLeadVocal !== false

  if (!isolateEnabled) {
    return {
      stage: PipelineStage.IsolateLeadVocal,
      success: true,
      durationMs: 0,
      artifacts: [],
      skipped: true,
    }
  }

  const stageDir = join(ctx.jobDir, STAGE_DIRS.isolate)
  await mkdir(stageDir, { recursive: true })

  const mixedVocalsPath = join(ctx.jobDir, STAGE_DIRS.separate, ARTIFACT_NAMES.vocals)
  if (!existsSync(mixedVocalsPath)) {
    return {
      stage: PipelineStage.IsolateLeadVocal,
      success: false,
      durationMs: 0,
      artifacts: [],
      error: `Required artifact not found: ${STAGE_DIRS.separate}/${ARTIFACT_NAMES.vocals}`,
    }
  }

  const isolator = new LeadVocalIsolatorAdapter()
  const result = await isolator.isolate(
    createAudioPath(mixedVocalsPath),
    stageDir,
    ctx.signal,
  )

  ctx.metadata.set('lead_isolation_enabled', true)
  ctx.metadata.set('lead_vocals_path', result.leadVocals.value)
  ctx.metadata.set('backing_vocals_path', result.backingVocals.value)

  return {
    stage: PipelineStage.IsolateLeadVocal,
    success: true,
    durationMs: 0,
    artifacts: [
      { path: `${STAGE_DIRS.isolate}/${ARTIFACT_NAMES.leadVocals}`, mimeType: 'audio/wav' },
      { path: `${STAGE_DIRS.isolate}/${ARTIFACT_NAMES.backingVocals}`, mimeType: 'audio/wav' },
    ],
  }
}
