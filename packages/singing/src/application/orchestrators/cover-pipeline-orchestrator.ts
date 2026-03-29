import type { StageResult } from '../../contracts/stage-result'
import type { CoverTask } from '../../domain/entities/cover-task'
import type { ValidationGateResult } from '../../evaluation/evaluation.types'
import type { Pipeline, PipelineCallbacks } from '../../pipeline/pipeline'

import { mkdir } from 'node:fs/promises'

import { PipelineStage } from '../../constants/pipeline-stage'
import { createPipelineContext } from '../../pipeline/context'
import { executePipeline } from '../../pipeline/pipeline'
import { autoCalibrateStage } from '../../pipeline/stages/auto-calibrate.stage'
import { convertVocalsStage } from '../../pipeline/stages/convert-vocals.stage'
import { evaluateStage } from '../../pipeline/stages/evaluate.stage'
import { extractF0Stage } from '../../pipeline/stages/extract-f0.stage'
import { finalizeStage } from '../../pipeline/stages/finalize.stage'
import { postprocessVocalsStage } from '../../pipeline/stages/postprocess-vocals.stage'
import { prepareSourceStage } from '../../pipeline/stages/prepare-source.stage'
import { remixStage } from '../../pipeline/stages/remix.stage'
import { separateVocalsStage } from '../../pipeline/stages/separate-vocals.stage'

export interface CoverPipelineResult {
  results: StageResult[]
  gateResult?: ValidationGateResult
  autoCalibrateUsed: boolean
  metadata: Record<string, unknown>
}

/**
 * Orchestrates the full cover pipeline: iterates through stages,
 * passes artifacts between them, handles errors.
 *
 * When autoCalibrate is enabled (default), includes AutoCalibrate
 * and Evaluate stages for parameter prediction and quality gating.
 */
export async function runCoverPipeline(
  task: CoverTask,
  signal?: AbortSignal,
  callbacks?: PipelineCallbacks,
): Promise<CoverPipelineResult> {
  await mkdir(task.outputDir, { recursive: true })

  const ctx = createPipelineContext(task, task.outputDir, signal)

  const useAutoCalibrate = !('autoCalibrate' in task.request)
    || (task.request as any).autoCalibrate !== false

  const stages: Pipeline['stages'] = [
    { stage: PipelineStage.PrepareSource, handler: prepareSourceStage },
    { stage: PipelineStage.SeparateVocals, handler: separateVocalsStage },
    { stage: PipelineStage.ExtractF0, handler: extractF0Stage },
  ]

  if (useAutoCalibrate) {
    stages.push({ stage: PipelineStage.AutoCalibrate, handler: autoCalibrateStage })
  }

  stages.push(
    { stage: PipelineStage.ConvertVocals, handler: convertVocalsStage },
    { stage: PipelineStage.PostprocessVocals, handler: postprocessVocalsStage },
    { stage: PipelineStage.Remix, handler: remixStage },
  )

  if (useAutoCalibrate) {
    stages.push({ stage: PipelineStage.Evaluate, handler: evaluateStage })
  }

  stages.push({ stage: PipelineStage.Finalize, handler: finalizeStage })

  const pipeline: Pipeline = { stages }

  const results = await executePipeline(pipeline, ctx, callbacks)

  return {
    results,
    gateResult: ctx.metadata.get('gate_result') as ValidationGateResult | undefined,
    autoCalibrateUsed: useAutoCalibrate,
    metadata: Object.fromEntries(ctx.metadata),
  }
}

/**
 * Re-run only the conversion→evaluation stages for a retry attempt.
 * Reuses the existing job dir (source/vocals/F0 from the first run).
 */
export async function rerunConversionStages(
  task: CoverTask,
  signal?: AbortSignal,
  callbacks?: PipelineCallbacks,
): Promise<CoverPipelineResult> {
  const ctx = createPipelineContext(task, task.outputDir, signal)

  const retryStages: Pipeline['stages'] = [
    { stage: PipelineStage.ConvertVocals, handler: convertVocalsStage },
    { stage: PipelineStage.PostprocessVocals, handler: postprocessVocalsStage },
    { stage: PipelineStage.Remix, handler: remixStage },
    { stage: PipelineStage.Evaluate, handler: evaluateStage },
    { stage: PipelineStage.Finalize, handler: finalizeStage },
  ]

  const results = await executePipeline({ stages: retryStages }, ctx, callbacks)

  return {
    results,
    gateResult: ctx.metadata.get('gate_result') as ValidationGateResult | undefined,
    autoCalibrateUsed: true,
    metadata: Object.fromEntries(ctx.metadata),
  }
}
