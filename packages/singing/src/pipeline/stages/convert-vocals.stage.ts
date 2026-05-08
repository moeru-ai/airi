import type { StageResult } from '../../contracts/stage-result'
import type { PipelineContext } from '../context'

import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { createConverter } from '../../adapters/converter/converter-router'
import { runFfmpeg } from '../../adapters/ffmpeg/ffmpeg-runner'
import { ConverterBackendId } from '../../constants/model-backends'
import { PipelineStage } from '../../constants/pipeline-stage'
import { createAudioPath } from '../../domain/value-objects/audio-path'
import { ARTIFACT_NAMES, STAGE_DIRS } from '../../manifests/artifact-layout'

/**
 * Stage: Convert Vocals
 * - Pre-process separated vocals (HPF 80Hz + DC removal)
 * - Run RVC or Seed-VC via Python worker
 */
export async function convertVocalsStage(
  ctx: PipelineContext,
): Promise<StageResult> {
  const stageDir = join(ctx.jobDir, STAGE_DIRS.convert)
  await mkdir(stageDir, { recursive: true })

  const leadVocalsPath = join(ctx.jobDir, STAGE_DIRS.isolate, ARTIFACT_NAMES.leadVocals)
  const mixedVocalsPath = join(ctx.jobDir, STAGE_DIRS.separate, ARTIFACT_NAMES.vocals)
  const vocalsPath = existsSync(leadVocalsPath) ? leadVocalsPath : mixedVocalsPath

  if (!existsSync(vocalsPath)) {
    return {
      stage: PipelineStage.ConvertVocals,
      success: false,
      durationMs: 0,
      artifacts: [],
      error: `Required artifact not found: ${ARTIFACT_NAMES.vocals}`,
    }
  }

  // Pre-process: HPF 80Hz (remove separation bass bleed) + DC offset removal.
  // NOTICE: dynaudnorm was removed because it alters the amplitude envelope,
  // which causes RMVPE (inside RVC) to misjudge voiced/unvoiced boundaries
  // and produce incorrect F0 values — manifesting as pitch drift in quiet sections.
  const preprocessedPath = join(stageDir, 'preprocessed_vocals.wav')
  const preprocessResult = await runFfmpeg([
    '-i',
    vocalsPath,
    '-af',
    'highpass=f=80,adc',
    '-acodec',
    'pcm_f32le',
    '-y',
    preprocessedPath,
  ], { signal: ctx.signal })

  const inputPath = preprocessResult.exitCode === 0 ? preprocessedPath : vocalsPath

  const backendId = ctx.task.request.mode === 'rvc'
    ? ConverterBackendId.RVC
    : ConverterBackendId.SeedVC

  const converter = createConverter(backendId)
  const converterParams: Record<string, unknown> = { ...ctx.task.request.converter }

  await converter.convert(
    createAudioPath(inputPath),
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
