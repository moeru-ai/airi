import type { CoverPipelineResult, JobQueue } from '@proj-airi/singing'
import type { CreateCoverRequest, CreateTrainRequest } from '@proj-airi/singing/types'

import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { InMemoryQueue, SingingError } from '@proj-airi/singing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSingingService } from '../src/services/singing/singing-service'

const runtimeEnv = vi.hoisted(() => ({
  ffmpegPath: 'ffmpeg',
  pythonPath: 'python',
  workerModulePath: '/fake/worker',
  pythonSrcDir: '/fake/src',
  modelsDir: '',
  voiceModelsDir: '',
  tempDir: '',
}))

vi.mock('@proj-airi/singing', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal()
  const { randomUUID } = await import('node:crypto')

  return {
    ...actual,
    resolveRuntimeEnv: vi.fn(() => runtimeEnv),
    createCoverJob: vi.fn(async (request: unknown, deps: { queue: InMemoryQueue }) => {
      const jobId = randomUUID()
      const now = new Date().toISOString()
      await deps.queue.enqueue({ id: jobId, status: 'pending', createdAt: now, updatedAt: now, payload: request })
      return { jobId, status: 'pending' }
    }),
    createTrainJob: vi.fn(async (request: unknown, deps: { queue: InMemoryQueue }) => {
      const jobId = randomUUID()
      const now = new Date().toISOString()
      await deps.queue.enqueue({ id: jobId, status: 'pending', createdAt: now, updatedAt: now, payload: request })
      return { jobId, status: 'pending' }
    }),
    runCoverPipeline: vi.fn(),
    rerunConversionStages: vi.fn(),
    runTrainingPipeline: vi.fn(),
  }
})

function makeCoverRequest(overrides?: Partial<CreateCoverRequest>): CreateCoverRequest {
  return {
    inputUri: '/tmp/test-input.wav',
    mode: 'rvc',
    separator: { backend: 'melband' as any },
    pitch: { backend: 'rmvpe' as any },
    converter: {
      backend: 'rvc',
      voiceId: 'test_voice',
      indexRate: 0.75,
      protect: 0.33,
    },
    ...overrides,
  }
}

function makeTrainRequest(overrides?: Partial<CreateTrainRequest>): CreateTrainRequest {
  return {
    voiceId: 'test_voice',
    datasetUri: '/tmp/dataset.wav',
    epochs: 10,
    batchSize: 4,
    ...overrides,
  }
}

function successResult(): CoverPipelineResult {
  return {
    results: [{ stage: 'prep' as any, success: true, durationMs: 10, artifacts: [] }],
    autoCalibrateUsed: true,
    metadata: {},
  }
}

function failedResult(error: string): CoverPipelineResult {
  return {
    results: [{ stage: 'prep' as any, success: false, durationMs: 10, artifacts: [], error }],
    autoCalibrateUsed: true,
    metadata: {},
  }
}

function gateFailedResult(failedMetrics: string[]): CoverPipelineResult {
  return {
    results: [{ stage: 'prep' as any, success: true, durationMs: 10, artifacts: [] }],
    gateResult: {
      passed: false,
      singer_similarity: 0.5,
      f0_corr: 0.8,
      source_leakage: 0.3,
      tearing_risk: 0.2,
      failed_metrics: failedMetrics,
    },
    autoCalibrateUsed: true,
    metadata: {},
  }
}

function gatePassedResult(): CoverPipelineResult {
  return {
    results: [{ stage: 'prep' as any, success: true, durationMs: 10, artifacts: [] }],
    gateResult: {
      passed: true,
      singer_similarity: 0.9,
      f0_corr: 0.95,
      source_leakage: 0.1,
      tearing_risk: 0.05,
      failed_metrics: [],
    },
    autoCalibrateUsed: true,
    metadata: {},
  }
}

function createQueueThatFailsTerminalUpdate(): JobQueue {
  const jobs = new Map<string, any>()
  let updateCount = 0

  return {
    async enqueue(job) {
      jobs.set(job.id, job)
    },
    async dequeue() {
      return null
    },
    async getJob(jobId) {
      return jobs.get(jobId) ?? null
    },
    async updateJob(jobId, update) {
      updateCount++
      if (updateCount >= 2)
        throw new Error('queue persistence unavailable')

      const job = jobs.get(jobId)
      if (job)
        jobs.set(jobId, { ...job, ...update })
    },
    async listJobs(status) {
      const list = [...jobs.values()]
      return status ? list.filter(job => job.status === status) : list
    },
  }
}

async function waitForJobStatus(
  queue: InMemoryQueue,
  jobId: string,
  terminal: Set<string>,
  timeoutMs = 3000,
): Promise<string> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const job = await queue.getJob(jobId)
    if (job && terminal.has(job.status))
      return job.status
    await new Promise(r => setTimeout(r, 10))
  }
  throw new Error(`Job ${jobId} did not reach terminal state within ${timeoutMs}ms`)
}

const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled'])

let mockRunCoverPipeline: ReturnType<typeof vi.fn>
let mockRerunConversionStages: ReturnType<typeof vi.fn>
let mockRunTrainingPipeline: ReturnType<typeof vi.fn>

beforeEach(async () => {
  const mod = await import('@proj-airi/singing')
  mockRunCoverPipeline = mod.runCoverPipeline as ReturnType<typeof vi.fn>
  mockRerunConversionStages = mod.rerunConversionStages as ReturnType<typeof vi.fn>
  mockRunTrainingPipeline = mod.runTrainingPipeline as ReturnType<typeof vi.fn>

  const testRoot = resolve(process.cwd(), '.tmp-singing-service-test')
  runtimeEnv.modelsDir = join(testRoot, 'models')
  runtimeEnv.voiceModelsDir = join(runtimeEnv.modelsDir, 'voice_models')
  runtimeEnv.tempDir = join(testRoot, 'temp')

  await rm(testRoot, { recursive: true, force: true })
  await mkdir(runtimeEnv.tempDir, { recursive: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterEach(async () => {
  await rm(resolve(process.cwd(), '.tmp-singing-service-test'), { recursive: true, force: true })
})

describe('createSingingService - cover lifecycle', () => {
  it('completed: pipeline success → job status is completed', async () => {
    const queue = new InMemoryQueue()
    mockRunCoverPipeline.mockResolvedValue(successResult())

    const svc = createSingingService({ queue })
    const { jobId } = await svc.createCover(makeCoverRequest())

    const status = await waitForJobStatus(queue, jobId, TERMINAL_STATES)
    expect(status).toBe('completed')
  })

  it('failed: pipeline stage failure → job status is failed', async () => {
    const queue = new InMemoryQueue()
    mockRunCoverPipeline.mockResolvedValue(failedResult('bad audio'))

    const svc = createSingingService({ queue })
    const { jobId } = await svc.createCover(makeCoverRequest())

    const status = await waitForJobStatus(queue, jobId, TERMINAL_STATES)
    expect(status).toBe('failed')

    const job = await queue.getJob(jobId)
    expect((job as any).error).toContain('bad audio')
  })

  it('failed: pipeline throws → job status is failed', async () => {
    const queue = new InMemoryQueue()
    mockRunCoverPipeline.mockRejectedValue(new Error('crash'))

    const svc = createSingingService({ queue })
    const { jobId } = await svc.createCover(makeCoverRequest())

    const status = await waitForJobStatus(queue, jobId, TERMINAL_STATES)
    expect(status).toBe('failed')
  })
  it('logs a warning if persisting failed cover status also fails', async () => {
    const queue = createQueueThatFailsTerminalUpdate()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockRunCoverPipeline.mockRejectedValue(new Error('crash'))

    const svc = createSingingService({ queue })
    const { jobId } = await svc.createCover(makeCoverRequest())

    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        `[singing] Failed to update job ${jobId} terminal status to failed:`,
        'queue persistence unavailable',
      )
    })
  })
})

describe('createSingingService - cancel semantics', () => {
  it('cancel during pipeline → job becomes cancelled, not failed', async () => {
    const queue = new InMemoryQueue()
    let resolveBlock!: () => void
    const blocked = new Promise<void>((r) => {
      resolveBlock = r
    })

    mockRunCoverPipeline.mockImplementation(async (_task: unknown, signal: AbortSignal) => {
      await blocked
      if (signal.aborted) {
        return failedResult('Pipeline aborted')
      }
      return successResult()
    })

    const svc = createSingingService({ queue })
    const { jobId } = await svc.createCover(makeCoverRequest())

    await waitForJobStatus(queue, jobId, new Set(['running']), 2000)

    await svc.cancelJob(jobId)
    resolveBlock()

    const status = await waitForJobStatus(queue, jobId, TERMINAL_STATES)
    expect(status).toBe('cancelled')
  })

  it('passes AbortSignal to runCoverPipeline', async () => {
    const queue = new InMemoryQueue()
    let receivedSignal: AbortSignal | undefined
    let resolveBlock!: () => void
    const blocked = new Promise<void>((r) => {
      resolveBlock = r
    })

    mockRunCoverPipeline.mockImplementation(async (_task: unknown, signal: AbortSignal) => {
      receivedSignal = signal
      await blocked
      return successResult()
    })

    const svc = createSingingService({ queue })
    const { jobId } = await svc.createCover(makeCoverRequest())

    await waitForJobStatus(queue, jobId, new Set(['running']), 2000)
    expect(receivedSignal).toBeInstanceOf(AbortSignal)
    expect(receivedSignal!.aborted).toBe(false)

    await svc.cancelJob(jobId)
    expect(receivedSignal!.aborted).toBe(true)

    resolveBlock()
    await waitForJobStatus(queue, jobId, TERMINAL_STATES)
  })
})

describe('createSingingService - retry with parameter adjustment', () => {
  it('retries with adjusted params when quality gate fails, then succeeds', async () => {
    const queue = new InMemoryQueue()
    const request = makeCoverRequest()

    mockRunCoverPipeline.mockResolvedValue(gateFailedResult(['singer_similarity']))
    mockRerunConversionStages.mockResolvedValue(gatePassedResult())

    const svc = createSingingService({ queue })
    const { jobId } = await svc.createCover(request)

    const status = await waitForJobStatus(queue, jobId, TERMINAL_STATES)
    expect(status).toBe('completed')
    expect(mockRerunConversionStages).toHaveBeenCalled()

    const job = await queue.getJob(jobId)
    expect((job as any).retryCount).toBeGreaterThan(0)
  })

  it('marks as failed after MAX_RETRY_ATTEMPTS if gate keeps failing', async () => {
    const queue = new InMemoryQueue()
    const request = makeCoverRequest()

    mockRunCoverPipeline.mockResolvedValue(gateFailedResult(['tearing_risk']))
    mockRerunConversionStages.mockResolvedValue(gateFailedResult(['tearing_risk']))

    const svc = createSingingService({ queue })
    const { jobId } = await svc.createCover(request)

    const status = await waitForJobStatus(queue, jobId, TERMINAL_STATES)
    expect(status).toBe('failed')

    const job = await queue.getJob(jobId)
    expect((job as any).error).toContain('Quality gate still failed')
    expect((job as any).retryCount).toBe(3)
  })
})

describe('createSingingService - training mutex', () => {
  it('locks a voice before awaiting job creation', async () => {
    const queue = new InMemoryQueue()
    const mod = await import('@proj-airi/singing')
    const createTrainJobMock = mod.createTrainJob as ReturnType<typeof vi.fn>
    let releaseCreateTrainJob!: () => void
    const createTrainJobBlocked = new Promise<void>((resolve) => {
      releaseCreateTrainJob = resolve
    })

    createTrainJobMock.mockImplementation(async (request: unknown, deps: { queue: InMemoryQueue }) => {
      await createTrainJobBlocked
      const jobId = 'locked-train-job'
      const now = new Date().toISOString()
      await deps.queue.enqueue({ id: jobId, status: 'pending', createdAt: now, updatedAt: now, payload: request })
      return { jobId, status: 'pending' }
    })
    mockRunTrainingPipeline.mockResolvedValue(undefined)

    const svc = createSingingService({ queue })
    const firstCreate = svc.createTrain(makeTrainRequest({ voiceId: 'race_voice' }))

    await Promise.resolve()

    await expect(
      svc.createTrain(makeTrainRequest({ voiceId: 'race_voice' })),
    ).rejects.toThrow(SingingError)

    releaseCreateTrainJob()
    await firstCreate
  })

  it('rejects concurrent training for the same voiceId', async () => {
    const queue = new InMemoryQueue()
    let resolveTraining!: () => void
    const trainingBlocked = new Promise<void>((r) => {
      resolveTraining = r
    })

    mockRunTrainingPipeline.mockImplementation(async () => {
      await trainingBlocked
    })

    const svc = createSingingService({ queue })
    await svc.createTrain(makeTrainRequest({ voiceId: 'shared_voice' }))

    await expect(
      svc.createTrain(makeTrainRequest({ voiceId: 'shared_voice' })),
    ).rejects.toThrow(SingingError)

    resolveTraining()
  })

  it('allows training for different voiceIds concurrently', async () => {
    const queue = new InMemoryQueue()
    let resolveTraining!: () => void
    const trainingBlocked = new Promise<void>((r) => {
      resolveTraining = r
    })

    mockRunTrainingPipeline.mockImplementation(async () => {
      await trainingBlocked
    })

    const svc = createSingingService({ queue })
    await svc.createTrain(makeTrainRequest({ voiceId: 'voice_a' }))

    const result = await svc.createTrain(makeTrainRequest({ voiceId: 'voice_b' }))
    expect(result.jobId).toBeDefined()

    resolveTraining()
  })

  it('releases mutex after training completes, allowing re-training', async () => {
    const queue = new InMemoryQueue()
    mockRunTrainingPipeline.mockResolvedValue(undefined)

    const svc = createSingingService({ queue })
    const { jobId } = await svc.createTrain(makeTrainRequest({ voiceId: 'reuse_voice' }))

    await waitForJobStatus(queue, jobId, TERMINAL_STATES)

    const result2 = await svc.createTrain(makeTrainRequest({ voiceId: 'reuse_voice' }))
    expect(result2.jobId).toBeDefined()
  })
})

describe('createSingingService - training lifecycle', () => {
  it('completed: training pipeline succeeds → job is completed', async () => {
    const queue = new InMemoryQueue()
    mockRunTrainingPipeline.mockResolvedValue(undefined)

    const svc = createSingingService({ queue })
    const { jobId } = await svc.createTrain(makeTrainRequest())

    const status = await waitForJobStatus(queue, jobId, TERMINAL_STATES)
    expect(status).toBe('completed')
  })

  it('failed: training throws → job is failed', async () => {
    const queue = new InMemoryQueue()
    mockRunTrainingPipeline.mockRejectedValue(new Error('GPU OOM'))

    const svc = createSingingService({ queue })
    const { jobId } = await svc.createTrain(makeTrainRequest())

    const status = await waitForJobStatus(queue, jobId, TERMINAL_STATES)
    expect(status).toBe('failed')
  })

  it('cancel during training → job is cancelled', async () => {
    const queue = new InMemoryQueue()
    let resolveTraining!: () => void
    const trainingBlocked = new Promise<void>((r) => {
      resolveTraining = r
    })

    mockRunTrainingPipeline.mockImplementation(async (_v: string, _d: string, opts: { signal?: AbortSignal }) => {
      await trainingBlocked
      if (opts?.signal?.aborted)
        throw new Error('Training cancelled')
    })

    const svc = createSingingService({ queue })
    const { jobId } = await svc.createTrain(makeTrainRequest())

    await waitForJobStatus(queue, jobId, new Set(['running']), 2000)

    await svc.cancelJob(jobId)
    resolveTraining()

    const status = await waitForJobStatus(queue, jobId, TERMINAL_STATES)
    expect(status).toBe('cancelled')
  })

  it('logs a warning if persisting failed training status also fails', async () => {
    const queue = createQueueThatFailsTerminalUpdate()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockRunTrainingPipeline.mockRejectedValue(new Error('GPU OOM'))

    const svc = createSingingService({ queue })
    const { jobId } = await svc.createTrain(makeTrainRequest())

    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        `[singing] Failed to update job ${jobId} terminal status to failed:`,
        'queue persistence unavailable',
      )
    })
  })
})

describe('createSingingService - managed upload cleanup', () => {
  it('removes a completed cover upload from the managed uploads directory', async () => {
    const queue = new InMemoryQueue()
    mockRunCoverPipeline.mockResolvedValue(successResult())

    const uploadsDir = join(runtimeEnv.tempDir, 'uploads')
    const uploadPath = join(uploadsDir, 'managed-input.wav')
    await mkdir(uploadsDir, { recursive: true })
    await writeFile(uploadPath, 'audio')

    const svc = createSingingService({ queue })
    const { jobId } = await svc.createCover(makeCoverRequest({ inputUri: uploadPath }))

    await waitForJobStatus(queue, jobId, TERMINAL_STATES)
    await vi.waitFor(() => {
      expect(existsSync(uploadPath)).toBe(false)
    })
  })

  it('does not delete arbitrary paths that merely contain an uploads segment', async () => {
    const queue = new InMemoryQueue()
    mockRunCoverPipeline.mockResolvedValue(successResult())

    const outsidePath = join(resolve(process.cwd(), '.tmp-singing-service-test-outside'), 'uploads', 'keep.wav')
    await rm(resolve(process.cwd(), '.tmp-singing-service-test-outside'), { recursive: true, force: true })
    await mkdir(join(resolve(process.cwd(), '.tmp-singing-service-test-outside'), 'uploads'), { recursive: true })
    await writeFile(outsidePath, 'audio')

    const svc = createSingingService({ queue })
    const { jobId } = await svc.createCover(makeCoverRequest({ inputUri: outsidePath }))

    await waitForJobStatus(queue, jobId, TERMINAL_STATES)
    expect(existsSync(outsidePath)).toBe(true)

    await rm(resolve(process.cwd(), '.tmp-singing-service-test-outside'), { recursive: true, force: true })
  })
})
