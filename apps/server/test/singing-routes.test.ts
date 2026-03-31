import type { SingingService } from '../src/services/singing/singing-service'
import type { HonoEnv } from '../src/types/hono'

import process from 'node:process'

import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { SingingError, SingingErrorCode } from '@proj-airi/singing'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSingingRoutes } from '../src/routes/singing'

const testUser = { id: 'user-1', name: 'Test User', email: 'test@example.com' }
const listVoicesMock = vi.hoisted(() => vi.fn())
const checkPythonRuntimePackagesMock = vi.hoisted(() => vi.fn())
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

  return {
    ...actual,
    checkPythonRuntimePackages: checkPythonRuntimePackagesMock,
    listVoices: listVoicesMock,
    resolveRuntimeEnv: vi.fn(() => runtimeEnv),
    writeMultipartFileToDisk: vi.fn(async (file: File, destinationPath: string) => {
      const arrayBuffer = await file.arrayBuffer()
      await writeFile(destinationPath, new Uint8Array(arrayBuffer))
    }),
  }
})

function createMockSingingService(): SingingService {
  return {
    createCover: vi.fn(async () => ({ jobId: 'cover-job', status: 'pending' })),
    createCoverReference: vi.fn(async () => ({ jobId: 'cover-ref-job', status: 'pending' })),
    getJob: vi.fn(async () => ({ job: { id: 'job-1', status: 'pending' } })),
    cancelJob: vi.fn(async () => ({ cancelled: true })),
    createTrain: vi.fn(async () => ({ jobId: 'train-job', status: 'pending' })),
  }
}

function createTestApp(singingService: SingingService) {
  const routes = createSingingRoutes(singingService)
  const app = new Hono<HonoEnv>()

  app.use('*', async (c, next) => {
    const user = (c.env as { user?: typeof testUser } | undefined)?.user
    if (user)
      c.set('user', user)
    await next()
  })

  app.route('/', routes)
  return app
}

describe('singingRoutes', () => {
  beforeEach(async () => {
    const testRoot = resolve(process.cwd(), '.tmp-singing-routes-test')
    runtimeEnv.modelsDir = join(testRoot, 'models')
    runtimeEnv.voiceModelsDir = join(runtimeEnv.modelsDir, 'voice_models')
    runtimeEnv.tempDir = join(testRoot, 'temp')

    listVoicesMock.mockReset()
    listVoicesMock.mockResolvedValue({
      voices: [{ id: 'voice-a', name: 'voice-a', hasRvcModel: true }],
    })
    checkPythonRuntimePackagesMock.mockReset()
    checkPythonRuntimePackagesMock.mockResolvedValue({
      installed: true,
      missing: [],
    })

    await rm(testRoot, { recursive: true, force: true })
  })

  afterEach(async () => {
    await rm(resolve(process.cwd(), '.tmp-singing-routes-test'), { recursive: true, force: true })
  })

  it('accepts multipart training uploads and passes a server-resolved datasetUri to the service', async () => {
    const singingService = createMockSingingService()
    const app = createTestApp(singingService)

    const formData = new FormData()
    formData.append('file', new File([new Uint8Array([1, 2, 3])], 'dataset.wav', { type: 'audio/wav' }))
    formData.append('params', JSON.stringify({
      voiceId: 'voice-a',
      epochs: 12,
      batchSize: 4,
    }))

    const res = await app.fetch(
      new Request('http://localhost/train', {
        method: 'POST',
        body: formData,
      }),
      { user: testUser } as any,
    )

    expect(res.status).toBe(201)
    expect(singingService.createTrain).toHaveBeenCalledTimes(1)

    expect(singingService.createTrain).toHaveBeenCalledWith(testUser.id, expect.any(Object))

    const request = vi.mocked(singingService.createTrain).mock.calls[0][1] as Record<string, unknown>
    expect(request.voiceId).toBe('voice-a')
    expect(request.epochs).toBe(12)
    expect(request.batchSize).toBe(4)
    expect(typeof request.datasetUri).toBe('string')
    expect(String(request.datasetUri)).toContain(join(runtimeEnv.tempDir, 'training-uploads'))
    expect(existsSync(String(request.datasetUri))).toBe(true)
  })

  it('returns voiceModels alongside the raw voices payload for the shared UI contract', async () => {
    await mkdir(join(runtimeEnv.modelsDir, 'voice_models', 'voice-a'), { recursive: true })
    await writeFile(join(runtimeEnv.modelsDir, 'voice_models', 'voice-a', 'voice-a.index'), 'index')

    const app = createTestApp(createMockSingingService())
    const res = await app.request('/models')
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.voices).toEqual([{ id: 'voice-a', name: 'voice-a', hasRvcModel: true }])
    expect(data.voiceModels).toEqual([{ name: 'voice-a', hasIndex: true }])
    expect(Array.isArray(data.baseModels)).toBe(true)
    expect(data.baseModels.length).toBeGreaterThan(0)
  })

  it('reports setup_required when Python packages are missing even if the binary exists', async () => {
    runtimeEnv.ffmpegPath = 'git'
    runtimeEnv.pythonPath = process.execPath
    checkPythonRuntimePackagesMock.mockResolvedValueOnce({
      installed: false,
      missing: ['torch', 'librosa'],
    })

    const app = createTestApp(createMockSingingService())
    const res = await app.request('/health')
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.status).toBe('setup_required')
    expect(data.python).toBe(true)
    expect(data.pythonVenv).toBe(false)
    expect(data.pythonPackagesInstalled).toBe(false)
    expect(data.pythonPackagesMissing).toEqual(['torch', 'librosa'])
  })

  it('streams artifact files without buffering the entire payload in route code', async () => {
    const singingService = createMockSingingService()
    const app = createTestApp(singingService)
    const artifactDir = join(runtimeEnv.tempDir, 'jobs', 'job-1', '05_mix')
    const artifactPath = join(artifactDir, 'final_cover.wav')

    await mkdir(artifactDir, { recursive: true })
    await writeFile(artifactPath, 'artifact-bytes')

    const res = await app.fetch(
      new Request('http://localhost/artifacts/job-1/05_mix/final_cover.wav'),
      { user: testUser } as any,
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/wav')
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(res.headers.get('content-length')).toBe(String('artifact-bytes'.length))
    expect(await res.text()).toBe('artifact-bytes')
  })

  it('returns 404 for missing artifact files before opening a broken stream', async () => {
    const app = createTestApp(createMockSingingService())

    const res = await app.fetch(
      new Request('http://localhost/artifacts/job-1/05_mix/missing.wav'),
      { user: testUser } as any,
    )

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Artifact not found' })
  })

  it('supports range requests for artifact audio playback metadata and seeking', async () => {
    const app = createTestApp(createMockSingingService())
    const artifactDir = join(runtimeEnv.tempDir, 'jobs', 'job-1', '05_mix')
    const artifactPath = join(artifactDir, 'final_cover.wav')

    await mkdir(artifactDir, { recursive: true })
    await writeFile(artifactPath, 'artifact-bytes')

    const res = await app.fetch(
      new Request('http://localhost/artifacts/job-1/05_mix/final_cover.wav', {
        headers: { Range: 'bytes=0-6' },
      }),
      { user: testUser } as any,
    )

    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe('bytes 0-6/14')
    expect(res.headers.get('content-length')).toBe('7')
    expect(await res.text()).toBe('artifac')
  })

  it('supports suffix range requests for artifact playback probes', async () => {
    const app = createTestApp(createMockSingingService())
    const artifactDir = join(runtimeEnv.tempDir, 'jobs', 'job-1', '05_mix')
    const artifactPath = join(artifactDir, 'final_cover.wav')

    await mkdir(artifactDir, { recursive: true })
    await writeFile(artifactPath, 'artifact-bytes')

    const res = await app.fetch(
      new Request('http://localhost/artifacts/job-1/05_mix/final_cover.wav', {
        headers: { Range: 'bytes=-4' },
      }),
      { user: testUser } as any,
    )

    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe('bytes 10-13/14')
    expect(res.headers.get('content-length')).toBe('4')
    expect(await res.text()).toBe('ytes')
  })

  it('returns 404 when the authenticated user does not own the requested job', async () => {
    const singingService = createMockSingingService()
    vi.mocked(singingService.getJob).mockRejectedValueOnce(
      new SingingError(SingingErrorCode.JobNotFound, 'Job hidden from other users'),
    )
    const app = createTestApp(singingService)

    const res = await app.fetch(
      new Request('http://localhost/jobs/foreign-job'),
      { user: testUser } as any,
    )

    expect(res.status).toBe(404)
    expect(singingService.getJob).toHaveBeenCalledWith(testUser.id, 'foreign-job')
  })

  it('checks job ownership before serving artifacts', async () => {
    const singingService = createMockSingingService()
    const app = createTestApp(singingService)
    const artifactDir = join(runtimeEnv.tempDir, 'jobs', 'job-1', '05_mix')
    const artifactPath = join(artifactDir, 'final_cover.wav')

    await mkdir(artifactDir, { recursive: true })
    await writeFile(artifactPath, 'artifact-bytes')

    const res = await app.fetch(
      new Request('http://localhost/artifacts/job-1/05_mix/final_cover.wav'),
      { user: testUser } as any,
    )

    expect(res.status).toBe(200)
    expect(singingService.getJob).toHaveBeenCalledWith(testUser.id, 'job-1')
  })
})
