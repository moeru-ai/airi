import type { Buffer } from 'node:buffer'

import type { PredictedParams } from '../../calibration/calibration.types'
import type { StageResult } from '../../contracts/stage-result'
import type { PipelineContext } from '../context'

import process from 'node:process'

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { PipelineStage } from '../../constants/pipeline-stage'
import { ARTIFACT_NAMES, STAGE_DIRS } from '../../manifests/artifact-layout'
import { resolveVoiceModelDir } from '../../utils/path'
import { resolveRuntimeEnv } from '../../utils/resolve-env'

/**
 * Stage: Auto-Calibrate
 * - Analyze the cleanest available vocal features
 * - Load target voice profile
 * - Predict optimal RVC parameters (pitch_shift, index_rate, protect, rms_mix_rate)
 * - Overwrite converter params in the pipeline context
 *
 * This stage is skipped if autoCalibrate is false in the request.
 */
export async function autoCalibrateStage(
  ctx: PipelineContext,
): Promise<StageResult> {
  const request = ctx.task.request

  if ('autoCalibrate' in request && (request as any).autoCalibrate === false) {
    return {
      stage: PipelineStage.AutoCalibrate,
      success: true,
      durationMs: 0,
      artifacts: [],
    }
  }

  const isolatedLeadPath = join(ctx.jobDir, STAGE_DIRS.isolate, ARTIFACT_NAMES.leadVocals)
  const separatedVocalsPath = join(ctx.jobDir, STAGE_DIRS.separate, ARTIFACT_NAMES.vocals)
  const vocalsPath = existsSync(isolatedLeadPath) ? isolatedLeadPath : separatedVocalsPath
  if (!existsSync(vocalsPath)) {
    return {
      stage: PipelineStage.AutoCalibrate,
      success: true,
      durationMs: 0,
      artifacts: [],
    }
  }

  try {
    const env = resolveRuntimeEnv()
    const voiceId = request.converter.backend === 'rvc'
      ? request.converter.voiceId
      : ''

    if (!voiceId)
      return { stage: PipelineStage.AutoCalibrate, success: true, durationMs: 0, artifacts: [] }

    const voiceModelDir = resolveVoiceModelDir(env.voiceModelsDir, voiceId)
    if (!voiceModelDir) {
      ctx.metadata.set('auto_calibrated', false)
      ctx.metadata.set('auto_calibrate_error', `Invalid voiceId: ${voiceId}`)
      return { stage: PipelineStage.AutoCalibrate, success: true, durationMs: 0, artifacts: [] }
    }

    const primaryProfilePath = join(voiceModelDir, 'voice_profile.json')
    const legacyProfilePath = join(env.modelsDir, `${voiceId}_profile.json`)
    const voiceProfilePath = existsSync(primaryProfilePath)
      ? primaryProfilePath
      : existsSync(legacyProfilePath)
        ? legacyProfilePath
        : ''

    if (!voiceProfilePath) {
      ctx.metadata.set('auto_calibrated', false)
      return { stage: PipelineStage.AutoCalibrate, success: true, durationMs: 0, artifacts: [] }
    }

    const predicted = await runPythonPredict(
      env.pythonPath,
      env.pythonSrcDir,
      vocalsPath,
      voiceProfilePath,
      ctx.signal,
    )

    if (predicted && request.converter.backend === 'rvc') {
      const confidence = predicted.pitch_confidence ?? 0
      const PITCH_CONFIDENCE_THRESHOLD = 0.6

      // Only apply predicted pitch shift when confidence is high enough;
      // a low-confidence shift (e.g. from poor F0 stats) can detune the
      // entire song by up to 4 semitones.
      request.converter.f0UpKey = confidence >= PITCH_CONFIDENCE_THRESHOLD
        ? predicted.pitch_shift
        : 0
      request.converter.indexRate = predicted.index_rate
      request.converter.filterRadius = predicted.filter_radius ?? 3
      request.converter.protect = predicted.protect
      request.converter.rmsMixRate = predicted.rms_mix_rate

      ctx.metadata.set('auto_calibrated', true)
      ctx.metadata.set('predicted_params', predicted)
      ctx.metadata.set('pitch_confidence', confidence)
      ctx.metadata.set('pitch_shift_applied', request.converter.f0UpKey)
    }

    return {
      stage: PipelineStage.AutoCalibrate,
      success: true,
      durationMs: 0,
      artifacts: [],
    }
  }
  catch {
    ctx.metadata.set('auto_calibrated', false)
    return {
      stage: PipelineStage.AutoCalibrate,
      success: true,
      durationMs: 0,
      artifacts: [],
    }
  }
}

async function runPythonPredict(
  pythonPath: string,
  pythonSrcDir: string,
  vocalPath: string,
  voiceProfilePath: string,
  signal?: AbortSignal,
): Promise<PredictedParams | null> {
  return new Promise((resolveP) => {
    const proc = spawn(pythonPath, [
      '-m',
      'airi_singing_worker.calibration',
      'predict',
      '--vocal',
      vocalPath,
      '--voice-profile',
      voiceProfilePath,
    ], {
      env: { ...process.env, PYTHONPATH: pythonSrcDir },
      shell: false,
      windowsHide: true,
    })

    if (signal) {
      const onAbort = () => {
        proc.kill('SIGTERM')
      }
      if (signal.aborted) {
        proc.kill('SIGTERM')
      }
      else {
        signal.addEventListener('abort', onAbort, { once: true })
        proc.on('close', () => signal.removeEventListener('abort', onAbort))
      }
    }

    let stdout = ''
    proc.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    proc.stderr?.on('data', () => {})
    proc.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        try {
          resolveP(JSON.parse(stdout.trim()))
        }
        catch {
          resolveP(null)
        }
      }
      else {
        resolveP(null)
      }
    })
    proc.on('error', () => resolveP(null))
  })
}
