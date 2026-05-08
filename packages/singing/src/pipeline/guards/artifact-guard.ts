import type { PipelineContext } from '../context'

import { SingingError, SingingErrorCode } from '../../contracts/error'

/**
 * Guard: verifies that expected artifacts from a previous stage exist
 * before the current stage begins execution.
 */
export function assertArtifactExists(
  ctx: PipelineContext,
  artifactKey: string,
): void {
  if (!ctx.artifacts.has(artifactKey)) {
    throw new SingingError(
      SingingErrorCode.InvalidInput,
      `Required artifact "${artifactKey}" not found in pipeline context`,
    )
  }
}
