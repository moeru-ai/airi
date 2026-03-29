import type { StageResult } from '../../contracts/stage-result'
import type { PipelineContext } from '../context'

import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { runFfmpeg } from '../../adapters/ffmpeg/ffmpeg-runner'
import { buildLoudnormFilter } from '../../adapters/ffmpeg/filters/normalize'
import { buildSidechainFilter } from '../../adapters/ffmpeg/filters/sidechain'
import { PipelineStage } from '../../constants/pipeline-stage'
import { ARTIFACT_NAMES, STAGE_DIRS } from '../../manifests/artifact-layout'

/**
 * Stage: Remix
 * - Mix converted vocals with instrumental via FFmpeg
 * - Apply sidechain compression (ducking), amix, loudnorm
 */
export async function remixStage(
  ctx: PipelineContext,
): Promise<StageResult> {
  const stageDir = join(ctx.jobDir, STAGE_DIRS.mix)
  await mkdir(stageDir, { recursive: true })

  const vocalsPath = join(ctx.jobDir, STAGE_DIRS.convert, ARTIFACT_NAMES.convertedVocals)
  const instPath = join(ctx.jobDir, STAGE_DIRS.separate, ARTIFACT_NAMES.instrumental)
  const outputPath = join(stageDir, ARTIFACT_NAMES.finalCover)

  for (const [label, path] of [['Converted vocals', vocalsPath], ['Instrumental', instPath]] as const) {
    if (!existsSync(path)) {
      return {
        stage: PipelineStage.Remix,
        success: false,
        durationMs: 0,
        artifacts: [],
        error: `${label} artifact not found: ${path}`,
      }
    }
  }

  const mix = ctx.task.request.mix
  const loudnorm = buildLoudnormFilter({
    targetLufs: mix?.targetLufs,
    truePeakDb: mix?.truePeakDb,
  })

  const fmt = 'aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo'
  const useDucking = mix?.ducking ?? true
  const vocalGainDb = mix?.vocalGainDb ?? 0
  const instGainDb = mix?.instGainDb ?? -8

  const vocalVol = vocalGainDb === 0 ? '' : `,volume=${vocalGainDb}dB`
  const instVol = `volume=${instGainDb}dB`

  let filterComplex: string
  if (useDucking) {
    const sidechain = buildSidechainFilter()
    filterComplex
      = `[0:a]${fmt}${vocalVol},asplit=2[voc1][voc2];[1:a]${fmt},${instVol}[inst];`
        + `[inst][voc1]${sidechain}[ducked];`
        + `[voc2][ducked]amix=inputs=2:duration=longest:normalize=0,${loudnorm}`
  }
  else {
    filterComplex
      = `[0:a]${fmt}${vocalVol}[voc];[1:a]${fmt},${instVol}[inst];`
        + `[voc][inst]amix=inputs=2:duration=longest:normalize=0,${loudnorm}`
  }

  const args = [
    '-i',
    vocalsPath,
    '-i',
    instPath,
    '-filter_complex',
    filterComplex,
    '-ar',
    '44100',
    '-y',
    outputPath,
  ]

  const result = await runFfmpeg(args, { signal: ctx.signal })
  if (result.exitCode !== 0) {
    return {
      stage: PipelineStage.Remix,
      success: false,
      durationMs: 0,
      artifacts: [],
      error: `FFmpeg remix failed (exit ${result.exitCode}): ${result.stderr.slice(-2000)}`,
    }
  }

  return {
    stage: PipelineStage.Remix,
    success: true,
    durationMs: 0,
    artifacts: [
      { path: `${STAGE_DIRS.mix}/${ARTIFACT_NAMES.finalCover}`, mimeType: 'audio/wav' },
    ],
  }
}
