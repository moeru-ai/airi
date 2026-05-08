import type { StageResult } from '../../contracts/stage-result'
import type { PipelineContext } from '../context'

import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { RmvpeAdapter } from '../../adapters/pitch/rmvpe.adapter'
import { PipelineStage } from '../../constants/pipeline-stage'
import { createAudioPath } from '../../domain/value-objects/audio-path'
import { ARTIFACT_NAMES, STAGE_DIRS } from '../../manifests/artifact-layout'

/**
 * Stage: Extract F0
 * - Run RMVPE on the cleanest available vocal stem
 * - Produce f0.npy pitch contour
 */
export async function extractF0Stage(
  ctx: PipelineContext,
): Promise<StageResult> {
  const stageDir = join(ctx.jobDir, STAGE_DIRS.pitch)
  await mkdir(stageDir, { recursive: true })

  const isolatedLeadPath = join(ctx.jobDir, STAGE_DIRS.isolate, ARTIFACT_NAMES.leadVocals)
  const separatedVocalsPath = join(ctx.jobDir, STAGE_DIRS.separate, ARTIFACT_NAMES.vocals)
  const vocalsPath = existsSync(isolatedLeadPath) ? isolatedLeadPath : separatedVocalsPath
  const extractor = new RmvpeAdapter()
  await extractor.extract(createAudioPath(vocalsPath), stageDir, ctx.signal)

  return {
    stage: PipelineStage.ExtractF0,
    success: true,
    durationMs: 0,
    artifacts: [
      { path: `${STAGE_DIRS.pitch}/${ARTIFACT_NAMES.f0}`, mimeType: 'application/octet-stream' },
    ],
  }
}
