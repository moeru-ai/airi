import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { InMemoryQueue } from '../src/adapters/queue/in-memory-queue'
import { cancelCoverJob } from '../src/application/use-cases/cancel-cover-job'
import { PipelineStage } from '../src/constants/pipeline-stage'
import { SingingError, SingingErrorCode } from '../src/contracts/error'
import { createPipelineContext } from '../src/pipeline/context'
import { executePipeline } from '../src/pipeline/pipeline'
import { checkBaseModels } from '../src/utils/base-models'
import { hashString } from '../src/utils/hash'
import { getSafeUploadExtension, resolveContainedPath } from '../src/utils/path'

describe('inMemoryQueue', () => {
  it('enqueue and dequeue in FIFO order', async () => {
    const q = new InMemoryQueue()
    const now = new Date().toISOString()
    await q.enqueue({ id: 'a', status: 'pending', createdAt: now, updatedAt: now })
    await q.enqueue({ id: 'b', status: 'pending', createdAt: now, updatedAt: now })

    const first = await q.dequeue()
    expect(first?.id).toBe('a')

    const second = await q.dequeue()
    expect(second?.id).toBe('b')

    const empty = await q.dequeue()
    expect(empty).toBeNull()
  })

  it('getJob returns job by id', async () => {
    const q = new InMemoryQueue()
    const now = new Date().toISOString()
    await q.enqueue({ id: 'x', status: 'pending', createdAt: now, updatedAt: now })

    expect(await q.getJob('x')).not.toBeNull()
    expect((await q.getJob('x'))?.status).toBe('pending')
    expect(await q.getJob('nonexistent')).toBeNull()
  })

  it('updateJob modifies job fields', async () => {
    const q = new InMemoryQueue()
    const now = new Date().toISOString()
    await q.enqueue({ id: 'j1', status: 'pending', createdAt: now, updatedAt: now })

    await q.updateJob('j1', { status: 'running', updatedAt: new Date().toISOString() })
    const job = await q.getJob('j1')
    expect(job?.status).toBe('running')
  })

  it('listJobs filters by status', async () => {
    const q = new InMemoryQueue()
    const now = new Date().toISOString()
    await q.enqueue({ id: 'a', status: 'pending', createdAt: now, updatedAt: now })
    await q.enqueue({ id: 'b', status: 'running', createdAt: now, updatedAt: now })
    await q.enqueue({ id: 'c', status: 'pending', createdAt: now, updatedAt: now })

    const pending = await q.listJobs('pending')
    expect(pending).toHaveLength(2)

    const all = await q.listJobs()
    expect(all).toHaveLength(3)
  })
})

describe('singingError', () => {
  it('carries code and message', () => {
    const err = new SingingError(SingingErrorCode.JobNotFound, 'not found')
    expect(err.code).toBe(SingingErrorCode.JobNotFound)
    expect(err.message).toBe('not found')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('pipelineContext', () => {
  it('creates with empty maps', () => {
    const task = {
      id: 'test-job',
      request: {} as any,
      outputDir: '/tmp/test',
      createdAt: new Date(),
    }
    const ctx = createPipelineContext(task, '/tmp/test')
    expect(ctx.artifacts.size).toBe(0)
    expect(ctx.timing.size).toBe(0)
    expect(ctx.metadata.size).toBe(0)
    expect(ctx.signal).toBeUndefined()
  })

  it('passes AbortSignal through', () => {
    const ac = new AbortController()
    const task = {
      id: 'test-job',
      request: {} as any,
      outputDir: '/tmp/test',
      createdAt: new Date(),
    }
    const ctx = createPipelineContext(task, '/tmp/test', ac.signal)
    expect(ctx.signal).toBe(ac.signal)
    expect(ctx.signal?.aborted).toBe(false)

    ac.abort()
    expect(ctx.signal?.aborted).toBe(true)
  })
})

describe('hashString', () => {
  it('returns deterministic hash', () => {
    const a = hashString('hello')
    const b = hashString('hello')
    expect(a).toBe(b)
  })

  it('different inputs produce different hashes', () => {
    expect(hashString('abc')).not.toBe(hashString('xyz'))
  })
})

describe('resolveContainedPath', () => {
  it('returns the resolved artifact path when it stays inside the base directory', () => {
    expect(resolveContainedPath('/tmp/jobs/job-1', 'mix/final.wav')).toBe(resolve('/tmp/jobs/job-1', 'mix/final.wav'))
  })

  it('rejects sibling traversal that only shares the directory prefix', () => {
    expect(resolveContainedPath('/tmp/jobs/job-1', '../job-12/secret.wav')).toBeNull()
  })
})

describe('getSafeUploadExtension', () => {
  it('keeps a known extension for normal uploads', () => {
    expect(getSafeUploadExtension('dataset.wav')).toBe('wav')
  })

  it('falls back when the multipart filename tries to smuggle path separators into the extension', () => {
    expect(getSafeUploadExtension('x.y/../../target')).toBe('wav')
  })
})

describe('checkBaseModels', () => {
  it('reports missing models when the inventory has not been provisioned yet', () => {
    const models = checkBaseModels(resolve('/tmp/nonexistent-singing-models'))
    expect(models.length).toBeGreaterThan(0)
    expect(models.every(model => model.exists === false)).toBe(true)
  })

  it('marks the tiny config model as present when the file exists', async () => {
    const root = resolve(process.cwd(), '.tmp-base-model-check')
    const configDir = resolve(root, 'separation')

    await rm(root, { recursive: true, force: true })
    await mkdir(configDir, { recursive: true })
    await writeFile(resolve(configDir, 'config_vocals_mel_band_roformer_kj.yaml'), 'config: ok')

    const models = checkBaseModels(root)
    const configModel = models.find(model => model.id === 'melband_roformer_config')

    expect(configModel?.exists).toBe(true)
    expect(configModel?.actualSize).toBeGreaterThan(0)

    await rm(root, { recursive: true, force: true })
  })
})

describe('cancelCoverJob', () => {
  it('cancels a pending job', async () => {
    const q = new InMemoryQueue()
    const now = new Date().toISOString()
    await q.enqueue({ id: 'j1', status: 'pending', createdAt: now, updatedAt: now })

    const result = await cancelCoverJob('j1', { queue: q })
    expect(result.cancelled).toBe(true)

    const job = await q.getJob('j1')
    expect(job?.status).toBe('cancelled')
  })

  it('cancels a running job', async () => {
    const q = new InMemoryQueue()
    const now = new Date().toISOString()
    await q.enqueue({ id: 'j2', status: 'running', createdAt: now, updatedAt: now })

    const result = await cancelCoverJob('j2', { queue: q })
    expect(result.cancelled).toBe(true)
  })

  it('refuses to cancel an already completed job', async () => {
    const q = new InMemoryQueue()
    const now = new Date().toISOString()
    await q.enqueue({ id: 'j3', status: 'completed', createdAt: now, updatedAt: now })

    const result = await cancelCoverJob('j3', { queue: q })
    expect(result.cancelled).toBe(false)
  })

  it('refuses to cancel an already cancelled job', async () => {
    const q = new InMemoryQueue()
    const now = new Date().toISOString()
    await q.enqueue({ id: 'j4', status: 'cancelled', createdAt: now, updatedAt: now })

    const result = await cancelCoverJob('j4', { queue: q })
    expect(result.cancelled).toBe(false)
  })

  it('refuses to overwrite a failed job with cancelled', async () => {
    const q = new InMemoryQueue()
    const now = new Date().toISOString()
    await q.enqueue({ id: 'j5', status: 'failed', createdAt: now, updatedAt: now })

    const result = await cancelCoverJob('j5', { queue: q })
    expect(result.cancelled).toBe(false)

    const job = await q.getJob('j5')
    expect(job?.status).toBe('failed')
  })

  it('throws SingingError for nonexistent job', async () => {
    const q = new InMemoryQueue()

    await expect(cancelCoverJob('ghost', { queue: q })).rejects.toThrow(SingingError)
  })
})

describe('executePipeline - cancellation', () => {
  it('marks remaining stages as aborted when signal fires', async () => {
    const ac = new AbortController()
    const task = {
      id: 'cancel-test',
      request: {} as any,
      outputDir: '/tmp/cancel-test',
      createdAt: new Date(),
    }
    const ctx = createPipelineContext(task, '/tmp/cancel-test', ac.signal)

    const pipeline = {
      stages: [
        {
          stage: PipelineStage.PrepareSource,
          handler: async () => {
            ac.abort()
            return { stage: PipelineStage.PrepareSource, success: true, durationMs: 10, artifacts: [] }
          },
        },
        {
          stage: PipelineStage.SeparateVocals,
          handler: async () => ({ stage: PipelineStage.SeparateVocals, success: true, durationMs: 10, artifacts: [] }),
        },
      ],
    }

    const results = await executePipeline(pipeline, ctx)

    expect(results).toHaveLength(2)
    expect(results[0].success).toBe(true)
    expect(results[1].success).toBe(false)
    expect(results[1].error).toBe('Pipeline aborted')
  })

  it('stops immediately when already aborted before first stage', async () => {
    const ac = new AbortController()
    ac.abort()

    const task = {
      id: 'pre-abort-test',
      request: {} as any,
      outputDir: '/tmp/pre-abort-test',
      createdAt: new Date(),
    }
    const ctx = createPipelineContext(task, '/tmp/pre-abort-test', ac.signal)

    const pipeline = {
      stages: [
        {
          stage: PipelineStage.PrepareSource,
          handler: async () => ({ stage: PipelineStage.PrepareSource, success: true, durationMs: 0, artifacts: [] }),
        },
      ],
    }

    const results = await executePipeline(pipeline, ctx)
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(false)
    expect(results[0].error).toBe('Pipeline aborted')
  })
})

describe('executePipeline - failure stops execution', () => {
  it('stops on first stage failure', async () => {
    const task = {
      id: 'fail-test',
      request: {} as any,
      outputDir: '/tmp/fail-test',
      createdAt: new Date(),
    }
    const ctx = createPipelineContext(task, '/tmp/fail-test')

    let secondRan = false
    const pipeline = {
      stages: [
        {
          stage: PipelineStage.PrepareSource,
          handler: async () => ({ stage: PipelineStage.PrepareSource, success: false, durationMs: 5, artifacts: [], error: 'bad input' }),
        },
        {
          stage: PipelineStage.SeparateVocals,
          handler: async () => {
            secondRan = true
            return { stage: PipelineStage.SeparateVocals, success: true, durationMs: 10, artifacts: [] }
          },
        },
      ],
    }

    const results = await executePipeline(pipeline, ctx)
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(false)
    expect(secondRan).toBe(false)
  })
})
