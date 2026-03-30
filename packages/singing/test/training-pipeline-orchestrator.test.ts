import process from 'node:process'

import { EventEmitter } from 'node:events'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.fn()

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  pid = 4321
  kill = vi.fn()
}

const testRoot = resolve(process.cwd(), '.tmp-training-pipeline-orchestrator')

describe('runTrainingPipeline', () => {
  beforeEach(async () => {
    vi.resetModules()
    spawnMock.mockReset()

    process.env.AIRI_SINGING_MODELS_DIR = resolve(testRoot, 'models')
    process.env.AIRI_SINGING_PYTHON_PATH = 'python'
    process.env.AIRI_SINGING_PYTHON_SRC = resolve(testRoot, 'python-src')
    delete process.env.AIRI_SINGING_TRAIN_TIMEOUT_MS

    await rm(testRoot, { recursive: true, force: true })
    await mkdir(process.env.AIRI_SINGING_MODELS_DIR, { recursive: true })
    await mkdir(process.env.AIRI_SINGING_PYTHON_SRC, { recursive: true })
  })

  afterEach(async () => {
    vi.restoreAllMocks()

    delete process.env.AIRI_SINGING_MODELS_DIR
    delete process.env.AIRI_SINGING_PYTHON_PATH
    delete process.env.AIRI_SINGING_PYTHON_SRC
    delete process.env.AIRI_SINGING_TRAIN_TIMEOUT_MS

    await rm(testRoot, { recursive: true, force: true })
  })

  it('does not force-timeout a long-running training job by default', async () => {
    const child = new FakeChildProcess()
    spawnMock.mockImplementation(() => child)

    const { runTrainingPipeline } = await import('../src/application/orchestrators/training-pipeline-orchestrator')
    const trainingPromise = runTrainingPipeline('voice-a', resolve(testRoot, 'dataset.wav'))
    const pendingState = await Promise.race([
      trainingPromise.then(() => 'resolved', () => 'rejected'),
      new Promise<'pending'>(resolve => setTimeout(resolve, 25, 'pending')),
    ])
    expect(pendingState).toBe('pending')

    child.emit('close', 0)
    await expect(trainingPromise).resolves.toBeUndefined()
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })

  it('respects an explicit timeout override when one is configured', async () => {
    const child = new FakeChildProcess()
    spawnMock.mockImplementation((command: string) => {
      if (command === 'taskkill')
        return new FakeChildProcess()

      return child
    })

    const { runTrainingPipeline } = await import('../src/application/orchestrators/training-pipeline-orchestrator')
    const trainingPromise = runTrainingPipeline('voice-a', resolve(testRoot, 'dataset.wav'), {
      timeoutMs: 10,
    })

    await expect(trainingPromise).rejects.toThrow('Training timed out after 10 ms')
  })
})
