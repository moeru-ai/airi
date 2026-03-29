import type { PipelineStage } from '../constants/pipeline-stage'
import type { StageResult } from '../contracts/stage-result'
import type { PipelineContext } from './context'

import { runStage } from './stage-runner'

/**
 * Handler function signature for a single pipeline stage.
 */
export type StageHandler = (ctx: PipelineContext) => Promise<StageResult>

/**
 * Pipeline definition: an ordered list of stages with their handlers.
 */
export interface Pipeline {
  stages: Array<{
    stage: PipelineStage
    handler: StageHandler
  }>
}

/**
 * Optional callbacks for pipeline lifecycle events.
 */
export interface PipelineCallbacks {
  onStageStart?: (stage: PipelineStage) => Promise<void> | void
  onStageComplete?: (stage: PipelineStage, result: StageResult) => Promise<void> | void
}

/**
 * Execute a full pipeline, running each stage in order.
 * Collects results and aborts on first failure.
 */
export async function executePipeline(
  pipeline: Pipeline,
  ctx: PipelineContext,
  callbacks?: PipelineCallbacks,
): Promise<StageResult[]> {
  const results: StageResult[] = []

  for (const { stage, handler } of pipeline.stages) {
    if (ctx.signal?.aborted) {
      results.push({
        stage,
        success: false,
        durationMs: 0,
        artifacts: [],
        error: 'Pipeline aborted',
      })
      break
    }

    await callbacks?.onStageStart?.(stage)

    const result = await runStage(stage, handler, ctx)
    results.push(result)

    await callbacks?.onStageComplete?.(stage, result)

    if (!result.success) {
      break
    }
  }

  return results
}
