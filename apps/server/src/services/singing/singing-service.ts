import type { JobQueue, PipelineCallbacks, ValidationGateResult } from '@proj-airi/singing'
import type { CreateCoverRequest, CreateTrainRequest } from '@proj-airi/singing/types'

import { unlink } from 'node:fs/promises'
import { join } from 'node:path'

import { errorMessageFrom } from '@moeru/std'
import {
  buildJobDir,
  buildUploadsDir,
  cancelCoverJob,
  createCoverJob,
  createTrainJob,
  getCoverJob,
  InMemoryQueue,
  isContainedPath,
  mapRequestToCoverTask,
  rerunConversionStages,
  resolveRuntimeEnv,
  runCoverPipeline,
  runTrainingPipeline,
  SingingError,
  SingingErrorCode,
} from '@proj-airi/singing'

const MAX_RETRY_ATTEMPTS = 3

/**
 * [singing] Application service for the singing voice conversion module.
 */
export interface SingingService {
  createCover: (request: CreateCoverRequest) => Promise<{ jobId: string, status: string }>
  createCoverReference: (request: CreateCoverRequest) => Promise<{ jobId: string, status: string }>
  getJob: (jobId: string) => Promise<unknown>
  cancelJob: (jobId: string) => Promise<{ cancelled: boolean }>
  createTrain: (request: CreateTrainRequest) => Promise<{ jobId: string, status: string }>
}

export interface SingingServiceDeps {
  queue?: JobQueue
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function adjustParamsFromGateResult(
  request: CreateCoverRequest,
  gate: ValidationGateResult,
): void {
  if (request.mode !== 'rvc')
    return
  const conv = request.converter
  if (conv.backend !== 'rvc')
    return

  for (const metric of gate.failed_metrics) {
    switch (metric) {
      case 'singer_similarity':
        conv.indexRate = clamp((conv.indexRate ?? 0.75) + 0.10, 0.10, 0.95)
        break
      case 'source_leakage':
        conv.indexRate = clamp((conv.indexRate ?? 0.75) - 0.10, 0.10, 0.95)
        break
      case 'tearing_risk':
        conv.protect = clamp((conv.protect ?? 0.33) - 0.08, 0.05, 0.50)
        conv.filterRadius = clamp((conv.filterRadius ?? 3) + 1, 1, 7)
        break
    }
  }
}

/**
 * Update job state for non-critical progress. Failures are logged but not rethrown
 * so that a transient queue issue doesn't crash the running pipeline.
 */
async function progressUpdate(queue: JobQueue, jobId: string, update: Partial<Record<string, unknown>>): Promise<void> {
  try {
    await queue.updateJob(jobId, update)
  }
  catch (err) {
    console.warn(`[singing] Failed to update job ${jobId} progress:`, errorMessageFrom(err) ?? 'Unknown error')
  }
}

function warnTerminalUpdateFailure(jobId: string, status: 'cancelled' | 'failed', error: unknown): void {
  console.warn(
    `[singing] Failed to update job ${jobId} terminal status to ${status}:`,
    errorMessageFrom(error) ?? 'Unknown error',
  )
}

function logDetachedJobFailure(jobId: string, kind: 'cover' | 'training', error: unknown): void {
  console.error(
    `[singing] Detached ${kind} job ${jobId} crashed unexpectedly:`,
    errorMessageFrom(error) ?? 'Unknown error',
  )
}

/**
 * [singing] Create a singing service instance with real pipeline execution.
 */
export function createSingingService(deps?: SingingServiceDeps): SingingService {
  const queue = deps?.queue ?? new InMemoryQueue()
  const env = resolveRuntimeEnv()
  const outputBaseDir = env.tempDir
  const coverUploadsDir = buildUploadsDir(env.tempDir)
  const trainingUploadsDir = join(env.tempDir, 'training-uploads')

  /** AbortControllers keyed by jobId — enables true task cancellation */
  const activeJobs = new Map<string, AbortController>()
  /** voiceIds that currently have a training job running — prevents concurrent overwrites */
  const activeTrainingVoices = new Set<string>()

  async function cleanupUploadFile(inputUri: string): Promise<void> {
    try {
      if (isContainedPath(coverUploadsDir, inputUri) || isContainedPath(trainingUploadsDir, inputUri)) {
        await unlink(inputUri)
      }
    }
    catch { /* upload file may already be removed */ }
  }

  async function executePipelineAsync(jobId: string, request: CreateCoverRequest) {
    const ac = new AbortController()
    activeJobs.set(jobId, ac)
    const stageTiming: Record<string, number> = {}
    let uploadCleaned = false

    async function finalizeUploadCleanup(): Promise<void> {
      if (uploadCleaned)
        return

      uploadCleaned = true
      await cleanupUploadFile(request.inputUri)
    }

    try {
      const jobDir = buildJobDir(outputBaseDir, jobId)
      const task = mapRequestToCoverTask(jobId, request, jobDir)

      await queue.updateJob(jobId, {
        status: 'running',
        updatedAt: new Date().toISOString(),
      })

      const callbacks: PipelineCallbacks = {
        async onStageStart(stage) {
          await progressUpdate(queue, jobId, {
            currentStage: stage,
            updatedAt: new Date().toISOString(),
          })
        },
        async onStageComplete(stage, result) {
          stageTiming[stage] = result.durationMs
          await progressUpdate(queue, jobId, {
            stageTiming: { ...stageTiming },
            updatedAt: new Date().toISOString(),
          })
        },
      }

      let pipelineResult = await runCoverPipeline(task, ac.signal, callbacks)

      if (ac.signal.aborted) {
        await finalizeUploadCleanup()
        await queue.updateJob(jobId, { status: 'cancelled', updatedAt: new Date().toISOString() })
        return
      }

      const failed = pipelineResult.results.find(r => !r.success)
      if (failed) {
        await finalizeUploadCleanup()
        await queue.updateJob(jobId, {
          status: 'failed',
          error: failed.error,
          stageTiming: { ...stageTiming },
          updatedAt: new Date().toISOString(),
        })
        return
      }

      let retryCount = 0
      while (
        pipelineResult.gateResult
        && !pipelineResult.gateResult.passed
        && retryCount < MAX_RETRY_ATTEMPTS
        && !ac.signal.aborted
      ) {
        retryCount++
        adjustParamsFromGateResult(request, pipelineResult.gateResult)

        await progressUpdate(queue, jobId, {
          retryCount,
          updatedAt: new Date().toISOString(),
        })

        pipelineResult = await rerunConversionStages(task, ac.signal, callbacks)

        if (ac.signal.aborted) {
          await finalizeUploadCleanup()
          await queue.updateJob(jobId, { status: 'cancelled', updatedAt: new Date().toISOString() })
          return
        }

        const retryFailed = pipelineResult.results.find(r => !r.success)
        if (retryFailed) {
          await finalizeUploadCleanup()
          await queue.updateJob(jobId, {
            status: 'failed',
            error: retryFailed.error,
            retryCount,
            stageTiming: { ...stageTiming },
            updatedAt: new Date().toISOString(),
          })
          return
        }
      }

      if (pipelineResult.gateResult && !pipelineResult.gateResult.passed) {
        const failedMetrics = pipelineResult.gateResult.failed_metrics.join(', ')
        await finalizeUploadCleanup()
        await queue.updateJob(jobId, {
          status: 'failed',
          error: `Quality gate still failed after ${retryCount} retries: ${failedMetrics}`,
          retryCount,
          stageTiming: { ...stageTiming },
          updatedAt: new Date().toISOString(),
        })
        return
      }

      await finalizeUploadCleanup()
      await queue.updateJob(jobId, {
        status: 'completed',
        retryCount,
        stageTiming: { ...stageTiming },
        updatedAt: new Date().toISOString(),
      })
    }
    catch (err) {
      const status = ac.signal.aborted ? 'cancelled' : 'failed'
      await finalizeUploadCleanup()
      await queue.updateJob(jobId, {
        status,
        error: errorMessageFrom(err) ?? String(err),
        updatedAt: new Date().toISOString(),
      }).catch(updateErr => warnTerminalUpdateFailure(jobId, status, updateErr))
    }
    finally {
      activeJobs.delete(jobId)
      await finalizeUploadCleanup()
    }
  }

  async function executeTrainingAsync(jobId: string, request: CreateTrainRequest) {
    const ac = new AbortController()
    activeJobs.set(jobId, ac)
    activeTrainingVoices.add(request.voiceId)
    let uploadCleaned = false

    async function finalizeUploadCleanup(): Promise<void> {
      if (uploadCleaned)
        return

      uploadCleaned = true
      await cleanupUploadFile(request.datasetUri)
    }

    try {
      await queue.updateJob(jobId, {
        status: 'running',
        updatedAt: new Date().toISOString(),
      })

      await runTrainingPipeline(request.voiceId, request.datasetUri, {
        epochs: request.epochs,
        batchSize: request.batchSize,
        signal: ac.signal,
        onProgress(progress) {
          progressUpdate(queue, jobId, {
            trainingPct: progress.pct,
            currentEpoch: progress.epoch,
            totalEpochs: progress.totalEpochs,
            lossG: progress.lossG,
            lossD: progress.lossD,
            trainingStep: progress.step,
            trainingStepTotal: progress.total,
            trainingStepName: progress.name,
            updatedAt: new Date().toISOString(),
          })
        },
      })

      await finalizeUploadCleanup()
      await queue.updateJob(jobId, {
        status: 'completed',
        trainingPct: 100,
        updatedAt: new Date().toISOString(),
      })
    }
    catch (err) {
      const status = ac.signal.aborted ? 'cancelled' : 'failed'
      await finalizeUploadCleanup()
      await queue.updateJob(jobId, {
        status,
        error: errorMessageFrom(err) ?? String(err),
        updatedAt: new Date().toISOString(),
      }).catch(updateErr => warnTerminalUpdateFailure(jobId, status, updateErr))
    }
    finally {
      activeJobs.delete(jobId)
      activeTrainingVoices.delete(request.voiceId)
      await finalizeUploadCleanup()
    }
  }

  return {
    async createCover(request) {
      const result = await createCoverJob(request, { queue })
      void executePipelineAsync(result.jobId, request).catch(err => logDetachedJobFailure(result.jobId, 'cover', err))
      return result
    },

    async createCoverReference(request) {
      const result = await createCoverJob(request, { queue })
      void executePipelineAsync(result.jobId, request).catch(err => logDetachedJobFailure(result.jobId, 'cover', err))
      return result
    },

    async getJob(jobId) {
      return getCoverJob(jobId, { queue })
    },

    async cancelJob(jobId) {
      const ac = activeJobs.get(jobId)
      if (ac) {
        ac.abort()
      }
      return cancelCoverJob(jobId, { queue })
    },

    async createTrain(request) {
      if (activeTrainingVoices.has(request.voiceId)) {
        throw new SingingError(
          SingingErrorCode.InvalidInput,
          `Voice "${request.voiceId}" already has a training job running — wait for it to complete or cancel it first`,
        )
      }

      const result = await createTrainJob(request, { queue })
      void executeTrainingAsync(result.jobId, request).catch(err => logDetachedJobFailure(result.jobId, 'training', err))
      return result
    },
  }
}
