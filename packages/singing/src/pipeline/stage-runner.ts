import type { PipelineStage } from '../constants/pipeline-stage'
import type { StageResult } from '../contracts/stage-result'
import type { PipelineContext } from './context'
import type { StageHandler } from './pipeline'

/**
 * Executes a single stage with timing, error handling, and artifact recording.
 */
export async function runStage(
  stage: PipelineStage,
  handler: StageHandler,
  ctx: PipelineContext,
): Promise<StageResult> {
  const startMs = performance.now()
  try {
    const result = await handler(ctx)
    const durationMs = Math.round(performance.now() - startMs)
    ctx.timing.set(stage, durationMs)

    for (const artifact of result.artifacts) {
      ctx.artifacts.set(artifact.path, artifact)
    }

    return { ...result, stage, durationMs }
  }
  catch (error) {
    const durationMs = Math.round(performance.now() - startMs)
    ctx.timing.set(stage, durationMs)
    return {
      stage,
      success: false,
      durationMs,
      artifacts: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
