import type { Buffer } from 'node:buffer'

import type { StageResult } from '../../contracts/stage-result'
import type { ValidationGateResult } from '../../evaluation/evaluation.types'
import type { PipelineContext } from '../context'

import process from 'node:process'

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { PipelineStage } from '../../constants/pipeline-stage'
import { ARTIFACT_NAMES, STAGE_DIRS } from '../../manifests/artifact-layout'
import { resolveRuntimeEnv } from '../../utils/resolve-env'

/**
 * Stage: Evaluate
 * - Run post-inference validation gate on converted vocals
 * - Compare output embedding against voice profile centroid
 * - Check F0 correlation, source leakage, tearing
 * - Store results in pipeline metadata for retry decisions
 *
 * This stage is skipped if autoCalibrate is false.
 */
export async function evaluateStage(
  ctx: PipelineContext,
): Promise<StageResult> {
  const request = ctx.task.request

  if ('autoCalibrate' in request && (request as any).autoCalibrate === false) {
    return {
      stage: PipelineStage.Evaluate,
      success: true,
      durationMs: 0,
      artifacts: [],
    }
  }

  const convertedPath = join(ctx.jobDir, STAGE_DIRS.convert, ARTIFACT_NAMES.convertedVocals)
  const sourcePath = join(ctx.jobDir, STAGE_DIRS.separate, ARTIFACT_NAMES.vocals)

  if (!existsSync(convertedPath) || !existsSync(sourcePath)) {
    return {
      stage: PipelineStage.Evaluate,
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

    if (!voiceId) {
      return { stage: PipelineStage.Evaluate, success: true, durationMs: 0, artifacts: [] }
    }

    const voiceModelDir = join(env.voiceModelsDir, voiceId)
    const primaryProfilePath = join(voiceModelDir, 'voice_profile.json')
    const legacyProfilePath = join(env.modelsDir, `${voiceId}_profile.json`)
    const voiceProfilePath = existsSync(primaryProfilePath)
      ? primaryProfilePath
      : existsSync(legacyProfilePath)
        ? legacyProfilePath
        : ''

    if (!voiceProfilePath) {
      ctx.metadata.set('eval_skipped', true)
      return { stage: PipelineStage.Evaluate, success: true, durationMs: 0, artifacts: [] }
    }

    const gateResult = await runPythonValidate(
      env.pythonPath,
      env.pythonSrcDir,
      convertedPath,
      sourcePath,
      voiceProfilePath,
      ctx.signal,
    )

    if (gateResult) {
      ctx.metadata.set('gate_result', gateResult)
      ctx.metadata.set('eval_passed', gateResult.passed)
    }

    return {
      stage: PipelineStage.Evaluate,
      success: true,
      durationMs: 0,
      artifacts: [],
    }
  }
  catch (err) {
    ctx.metadata.set('eval_error', err instanceof Error ? err.message : String(err))
    return {
      stage: PipelineStage.Evaluate,
      success: true,
      durationMs: 0,
      artifacts: [],
    }
  }
}

async function runPythonValidate(
  pythonPath: string,
  pythonSrcDir: string,
  outputPath: string,
  sourcePath: string,
  voiceProfilePath: string,
  signal?: AbortSignal,
): Promise<ValidationGateResult | null> {
  return new Promise((resolveP) => {
    const proc = spawn(pythonPath, [
      '-m',
      'airi_singing_worker.calibration',
      'validate',
      '--output',
      outputPath,
      '--source',
      sourcePath,
      '--voice-profile',
      voiceProfilePath,
    ], {
      env: { ...process.env, PYTHONPATH: pythonSrcDir },
      shell: process.platform === 'win32',
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
