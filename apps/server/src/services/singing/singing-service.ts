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

const MAX_RETRY_ATTEMPTS = 8

/**
 * [singing] Application service for the singing voice conversion module.
 */
export interface SingingService {
  createCover: (userId: string, request: CreateCoverRequest) => Promise<{ jobId: string, status: string }>
  createCoverReference: (userId: string, request: CreateCoverRequest) => Promise<{ jobId: string, status: string }>
  getJob: (userId: string, jobId: string) => Promise<unknown>
  cancelJob: (userId: string, jobId: string) => Promise<{ cancelled: boolean }>
  createTrain: (userId: string, request: CreateTrainRequest) => Promise<{ jobId: string, status: string }>
}

export interface SingingServiceDeps {
  queue?: JobQueue
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function computeGateScore(gate: ValidationGateResult | undefined): number {
  if (!gate)
    return 0
  const sim = gate.singer_similarity ?? 0
  const f0 = gate.f0_corr ?? 0
  const leakage = gate.source_leakage ?? 1
  return 0.4 * sim + 0.3 * f0 + 0.3 * (1 - leakage)
}

function adjustParamsFromGateResult(
  request: CreateCoverRequest,
  gate: ValidationGateResult,
  retryCount: number = 1,
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
        conv.indexRate = clamp((conv.indexRate ?? 0.75) + 0.10, 0.10, 0.95)
        break
      case 'f0_corr': {
        const direction = retryCount % 2 === 1 ? 1 : -1
        conv.f0UpKey = (conv.f0UpKey ?? 0) + direction
        break
      }
      case 'tearing':
      case 'tearing_risk':
        conv.protect = clamp((conv.protect ?? 0.33) - 0.08, 0.05, 0.50)
        conv.filterRadius = clamp((conv.filterRadius ?? 3) + 1, 1, 7)
        conv.rmsMixRate = clamp((conv.rmsMixRate ?? 0.25) - 0.05, 0.05, 0.80)
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

  function acquireTrainingVoiceLock(voiceId: string): boolean {
    if (activeTrainingVoices.has(voiceId))
      return false

    activeTrainingVoices.add(voiceId)
    return true
  }

  function releaseTrainingVoiceLock(voiceId: string): void {
    activeTrainingVoices.delete(voiceId)
  }

  async function getOwnedJobOrThrow(userId: string, jobId: string) {
    const job = await queue.getJob(jobId)
    if (!job || job.ownerId !== userId) {
      throw new SingingError(SingingErrorCode.JobNotFound, `Job ${jobId} not found`)
    }

    return job
  }

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
      let bestScore = computeGateScore(pipelineResult.gateResult)
      let bestRetry = 0
      const savedRequest = JSON.parse(JSON.stringify(request))

      while (
        pipelineResult.gateResult
        && !pipelineResult.gateResult.passed
        && retryCount < MAX_RETRY_ATTEMPTS
        && !ac.signal.aborted
      ) {
        retryCount++
        adjustParamsFromGateResult(request, pipelineResult.gateResult, retryCount)

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

        const score = computeGateScore(pipelineResult.gateResult)
        if (score > bestScore) {
          bestScore = score
          bestRetry = retryCount
          Object.assign(savedRequest, JSON.parse(JSON.stringify(request)))
        }
      }

      if (pipelineResult.gateResult && !pipelineResult.gateResult.passed) {
        if (bestRetry !== retryCount && !ac.signal.aborted) {
          Object.assign(request, savedRequest)
          task.request = request
          pipelineResult = await rerunConversionStages(task, ac.signal, callbacks)
          const finalFailed = pipelineResult.results.find(r => !r.success)
          if (finalFailed) {
            await finalizeUploadCleanup()
            await queue.updateJob(jobId, {
              status: 'failed',
              error: finalFailed.error,
              retryCount,
              stageTiming: { ...stageTiming },
              updatedAt: new Date().toISOString(),
            })
            return
          }
        }

        if (!pipelineResult.gateResult?.passed) {
          const failedMetrics = pipelineResult.gateResult?.failed_metrics?.join(', ') ?? 'unknown'
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
      releaseTrainingVoiceLock(request.voiceId)
      await finalizeUploadCleanup()
    }
  }

  return {
    async createCover(userId, request) {
      const result = await createCoverJob(request, { queue, ownerId: userId })
      void executePipelineAsync(result.jobId, request).catch(err => logDetachedJobFailure(result.jobId, 'cover', err))
      return result
    },

    async createCoverReference(userId, request) {
      const result = await createCoverJob(request, { queue, ownerId: userId })
      void executePipelineAsync(result.jobId, request).catch(err => logDetachedJobFailure(result.jobId, 'cover', err))
      return result
    },

    async getJob(userId, jobId) {
      await getOwnedJobOrThrow(userId, jobId)
      return getCoverJob(jobId, { queue })
    },

    async cancelJob(userId, jobId) {
      await getOwnedJobOrThrow(userId, jobId)
      const ac = activeJobs.get(jobId)
      if (ac) {
        ac.abort()
      }
      return cancelCoverJob(jobId, { queue })
    },

    async createTrain(userId, request) {
      if (!acquireTrainingVoiceLock(request.voiceId)) {
        throw new SingingError(
          SingingErrorCode.InvalidInput,
          `Voice "${request.voiceId}" already has a training job running — wait for it to complete or cancel it first`,
        )
      }

      let result
      try {
        result = await createTrainJob(request, { queue, ownerId: userId })
      }
      catch (error) {
        releaseTrainingVoiceLock(request.voiceId)
        throw error
      }

      void executeTrainingAsync(result.jobId, request).catch(err => logDetachedJobFailure(result.jobId, 'training', err))
      return result
    },
  }
}
