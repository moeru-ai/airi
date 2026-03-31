import type { StageResult } from '../../contracts/stage-result'
import type { PipelineContext } from '../context'

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { runFfmpeg } from '../../adapters/ffmpeg/ffmpeg-runner'
import { buildTranscodeArgs } from '../../adapters/ffmpeg/filters/transcode'
import { resolveRuntimeEnv } from '../../adapters/runtime/env-resolver'
import { runProcess } from '../../adapters/runtime/process-runner'
import { WORKING_SAMPLE_RATE } from '../../constants/file-formats'
import { PipelineStage } from '../../constants/pipeline-stage'
import { ARTIFACT_NAMES, STAGE_DIRS } from '../../manifests/artifact-layout'

const FFPROBE_RE = /ffmpeg(\.exe)?$/i

export type { StageHandler } from '../pipeline'

/**
 * Stage: Prepare Source
 * - Transcode input to working format (44.1kHz 16-bit WAV)
 */
export async function prepareSourceStage(
  ctx: PipelineContext,
): Promise<StageResult> {
  const stageDir = join(ctx.jobDir, STAGE_DIRS.prep)
  await mkdir(stageDir, { recursive: true })

  const inputPath = ctx.task.request.inputUri
  const outputPath = join(stageDir, ARTIFACT_NAMES.source)

  const args = buildTranscodeArgs(inputPath, outputPath, {
    sampleRate: WORKING_SAMPLE_RATE,
    bitDepth: 32,
    channels: 2,
  })

  const result = await runFfmpeg(args, { signal: ctx.signal })
  if (result.exitCode !== 0) {
    return {
      stage: PipelineStage.PrepareSource,
      success: false,
      durationMs: 0,
      artifacts: [],
      error: `FFmpeg transcode failed (exit ${result.exitCode}): ${result.stderr.slice(0, 500)}`,
    }
  }

  try {
    const env = resolveRuntimeEnv()
    const ffprobeBin = env.ffmpegPath.replace(FFPROBE_RE, 'ffprobe$1')
    const probeResult = await runProcess(ffprobeBin, [
      '-i',
      outputPath,
      '-show_entries',
      'format=duration',
      '-v',
      'quiet',
      '-of',
      'csv=p=0',
    ], { timeoutMs: 30_000, signal: ctx.signal })
    const probeDuration = Number.parseFloat(probeResult.stdout.trim())
    if (!Number.isNaN(probeDuration)) {
      ctx.metadata.set('sourceDurationSeconds', probeDuration)
    }
  }
  catch { /* ffprobe may not be available; duration stays unknown */ }

  return {
    stage: PipelineStage.PrepareSource,
    success: true,
    durationMs: 0,
    artifacts: [{
      path: `${STAGE_DIRS.prep}/${ARTIFACT_NAMES.source}`,
      mimeType: 'audio/wav',
    }],
  }
}
