import type { JobQueue } from '../../adapters/queue/job-queue.interface'
import type { CoverArtifacts } from '../../types/artifact'
import type { GetJobResponse } from '../../types/response'

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { SingingError, SingingErrorCode } from '../../contracts/error'
import { ARTIFACT_NAMES, STAGE_DIRS } from '../../manifests/artifact-layout'
import { resolveRuntimeEnv } from '../../utils/resolve-env'

/**
 * Use case: retrieve the current status and artifacts of a cover job.
 */
export interface GetCoverJobDeps {
  queue: JobQueue
}

export async function getCoverJob(
  jobId: string,
  deps: GetCoverJobDeps,
): Promise<GetJobResponse> {
  const job = await deps.queue.getJob(jobId)
  if (!job) {
    throw new SingingError(SingingErrorCode.JobNotFound, `Job ${jobId} not found`)
  }

  let artifacts: Partial<CoverArtifacts> | undefined
  if (job.status === 'completed' || job.status === 'failed') {
    const env = resolveRuntimeEnv()
    const jobDir = join(env.tempDir, 'jobs', jobId)
    artifacts = {}

    const checks: Array<[keyof CoverArtifacts, string, string]> = [
      ['vocals', join(STAGE_DIRS.separate, ARTIFACT_NAMES.vocals), 'audio/wav'],
      ['instrumental', join(STAGE_DIRS.separate, ARTIFACT_NAMES.instrumental), 'audio/wav'],
      ['convertedVocals', join(STAGE_DIRS.convert, ARTIFACT_NAMES.convertedVocals), 'audio/wav'],
      ['finalCover', join(STAGE_DIRS.mix, ARTIFACT_NAMES.finalCover), 'audio/wav'],
      ['manifest', ARTIFACT_NAMES.manifest, 'application/json'],
    ]

    for (const [key, relPath, mimeType] of checks) {
      if (existsSync(join(jobDir, relPath))) {
        artifacts[key] = { path: relPath, mimeType }
      }
    }
  }

  return { job, artifacts }
}
