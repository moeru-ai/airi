import type {
  CreateCoverRequest,
  CreateTrainRequest,
  SingingHealthResponse,
  SingingModelsResponse,
} from '@proj-airi/singing/types'

import type { SingingService } from '../../services/singing/singing-service'
import type { HonoEnv } from '../../types/hono'

import process from 'node:process'

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  buildJobDir,
  buildUploadsDir,
  checkBaseModels,
  getSafeUploadExtension,
  resolveContainedPath,
  resolveRuntimeEnv,
  SingingError,
  SingingErrorCode,
} from '@proj-airi/singing'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { safeParse } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { createBadRequestError } from '../../utils/error'
import { CreateCoverJsonSchema, CreateCoverMultipartSchema, CreateCoverReferenceSchema, CreateTrainMultipartSchema, CreateTrainSchema } from './schema'

const SINGING_BODY_LIMIT = 100 * 1024 * 1024

function singingErrorToStatus(code: SingingErrorCode): number {
  switch (code) {
    case SingingErrorCode.JobNotFound:
    case SingingErrorCode.VoiceNotFound:
    case SingingErrorCode.ModelNotFound:
      return 404
    case SingingErrorCode.InvalidInput:
    case SingingErrorCode.UnsupportedFormat:
    case SingingErrorCode.JobAlreadyCancelled:
      return 400
    default:
      return 500
  }
}

async function checkBinaryExists(bin: string, args: string[] = ['--version']): Promise<boolean> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)
  try {
    await execFileAsync(bin, args, {
      timeout: 5000,
      windowsHide: true,
    })
    return true
  }
  catch {
    return false
  }
}

function parseMultipartParams(paramsRaw: string | null): Record<string, unknown> {
  try {
    return paramsRaw ? JSON.parse(paramsRaw) : {}
  }
  catch {
    throw createBadRequestError('Invalid JSON in params field', 'INVALID_JSON')
  }
}

function buildSafeUploadPath(uploadsDir: string, uploadId: string, fileName: string): string {
  const safeExtension = getSafeUploadExtension(fileName)
  const savedPath = resolveContainedPath(uploadsDir, `${uploadId}.${safeExtension}`)
  if (!savedPath)
    throw new Error('Failed to allocate a contained upload path')
  return savedPath
}

/**
 * [singing] Routes for the AI singing voice conversion module.
 */
export function createSingingRoutes(singingService: SingingService) {
  const app = new Hono<HonoEnv>()

  app.get('/health', async (c) => {
    const env = resolveRuntimeEnv()
    const baseModels = checkBaseModels(env.modelsDir)
    const baseModelsReady = baseModels.every(model => model.exists)
    const [ffmpegOk, pythonOk] = await Promise.all([
      checkBinaryExists(env.ffmpegPath, ['-version']),
      checkBinaryExists(env.pythonPath, ['--version']),
    ])
    const response: SingingHealthResponse = {
      status: ffmpegOk && pythonOk
        ? (baseModelsReady ? 'ready' : 'models_needed')
        : 'setup_required',
      setupSupported: false,
      ffmpeg: ffmpegOk,
      ffmpegPath: env.ffmpegPath,
      python: pythonOk,
      pythonPath: env.pythonPath,
      pythonVenv: pythonOk,
      pythonVenvExists: pythonOk,
      pythonPackagesInstalled: pythonOk,
      pythonPackagesMissing: pythonOk ? [] : ['python runtime unavailable'],
      uvAvailable: false,
      venvExists: pythonOk,
      modelsDir: env.modelsDir,
      singingPkgRoot: null,
      moduleLoaded: true,
      platform: process.platform,
      arch: process.arch,
      baseModels,
      baseModelsReady,
    }
    return c.json(response)
  })

  app.get('/models', async (c) => {
    const env = resolveRuntimeEnv()
    const { listVoices } = await import('@proj-airi/singing')
    const result = await listVoices({ modelsDir: env.modelsDir })
    const voiceModels = result.voices.map(voice => ({
      name: voice.name,
      hasIndex: existsSync(join(env.modelsDir, 'voice_models', voice.name, `${voice.name}.index`)),
    }))
    const response: SingingModelsResponse = {
      ...result,
      voiceModels,
      baseModels: checkBaseModels(env.modelsDir),
    }
    return c.json(response)
  })

  const authed = new Hono<HonoEnv>()
    .use('*', authGuard)
    .use('*', bodyLimit({ maxSize: SINGING_BODY_LIMIT }))

  authed.post('/cover', async (c) => {
    try {
      const contentType = c.req.header('content-type') ?? ''

      let request: CreateCoverRequest

      if (contentType.includes('multipart/form-data')) {
        const formData = await c.req.formData()
        const file = formData.get('file') as File | null
        const paramsRaw = formData.get('params') as string | null

        if (!file)
          throw createBadRequestError('Missing file in multipart upload', 'MISSING_FILE')

        const params = parseMultipartParams(paramsRaw)

        const result = safeParse(CreateCoverMultipartSchema, params)
        if (!result.success)
          throw createBadRequestError('Invalid cover request', 'INVALID_REQUEST', result.issues)

        const { randomUUID } = await import('node:crypto')

        const env = resolveRuntimeEnv()
        const uploadsDir = buildUploadsDir(env.tempDir)
        await mkdir(uploadsDir, { recursive: true })

        const uploadId = randomUUID()
        const savedPath = buildSafeUploadPath(uploadsDir, uploadId, file.name)
        const arrayBuffer = await file.arrayBuffer()
        await writeFile(savedPath, new Uint8Array(arrayBuffer))

        request = {
          ...(result.output as CreateCoverRequest),
          inputUri: savedPath,
          originalFileName: file.name,
        }
      }
      else {
        const body = await c.req.json()
        const result = safeParse(CreateCoverJsonSchema, body)
        if (!result.success)
          throw createBadRequestError('Invalid cover request', 'INVALID_REQUEST', result.issues)

        request = result.output as CreateCoverRequest
      }

      const response = await singingService.createCover(request)
      return c.json(response, 201)
    }
    catch (err) {
      if (err instanceof SingingError)
        return c.json({ error: err.message, code: err.code }, singingErrorToStatus(err.code) as any)

      throw err
    }
  })

  authed.post('/cover-reference', async (c) => {
    try {
      const body = await c.req.json()
      const result = safeParse(CreateCoverReferenceSchema, body)
      if (!result.success)
        throw createBadRequestError('Invalid cover-reference request', 'INVALID_REQUEST', result.issues)

      const output = result.output as Record<string, unknown>
      const request: CreateCoverRequest = {
        inputUri: output.inputUri as string,
        mode: 'seedvc',
        separator: output.separator as CreateCoverRequest['separator'],
        pitch: output.pitch as CreateCoverRequest['pitch'],
        converter: output.converter as CreateCoverRequest['converter'],
        mix: output.mix as CreateCoverRequest['mix'],
      }
      const response = await singingService.createCoverReference(request)
      return c.json(response, 201)
    }
    catch (err) {
      if (err instanceof SingingError)
        return c.json({ error: err.message, code: err.code }, singingErrorToStatus(err.code) as any)

      throw err
    }
  })

  authed.get('/jobs/:id', async (c) => {
    try {
      const jobId = c.req.param('id')
      const response = await singingService.getJob(jobId)
      return c.json(response)
    }
    catch (err) {
      if (err instanceof SingingError)
        return c.json({ error: err.message, code: err.code }, singingErrorToStatus(err.code) as any)

      throw err
    }
  })

  authed.post('/jobs/:id/cancel', async (c) => {
    try {
      const jobId = c.req.param('id')
      const response = await singingService.cancelJob(jobId)
      return c.json(response)
    }
    catch (err) {
      if (err instanceof SingingError)
        return c.json({ error: err.message, code: err.code }, singingErrorToStatus(err.code) as any)

      throw err
    }
  })

  authed.post('/train', async (c) => {
    try {
      const contentType = c.req.header('content-type') ?? ''
      let request: CreateTrainRequest

      if (contentType.includes('multipart/form-data')) {
        const formData = await c.req.formData()
        const file = formData.get('file') as File | null
        const paramsRaw = formData.get('params') as string | null

        if (!file)
          throw createBadRequestError('Missing dataset file in multipart upload', 'MISSING_FILE')

        const params = parseMultipartParams(paramsRaw)
        const result = safeParse(CreateTrainMultipartSchema, params)
        if (!result.success)
          throw createBadRequestError('Invalid train request', 'INVALID_REQUEST', result.issues)

        const { randomUUID } = await import('node:crypto')
        const env = resolveRuntimeEnv()
        const uploadsDir = join(env.tempDir, 'training-uploads')
        await mkdir(uploadsDir, { recursive: true })

        const uploadId = randomUUID()
        const datasetUri = buildSafeUploadPath(uploadsDir, uploadId, file.name)
        const arrayBuffer = await file.arrayBuffer()
        await writeFile(datasetUri, new Uint8Array(arrayBuffer))

        request = {
          ...result.output,
          datasetUri,
        }
      }
      else {
        const body = await c.req.json()
        const result = safeParse(CreateTrainSchema, body)
        if (!result.success)
          throw createBadRequestError('Invalid train request', 'INVALID_REQUEST', result.issues)

        request = result.output
      }

      const response = await singingService.createTrain(request)
      return c.json(response, 201)
    }
    catch (err) {
      if (err instanceof SingingError)
        return c.json({ error: err.message, code: err.code }, singingErrorToStatus(err.code) as any)

      throw err
    }
  })

  authed.get('/artifacts/:jobId/:path{.+}', async (c) => {
    const jobId = c.req.param('jobId')
    const artifactPath = c.req.param('path')
    try {
      const env = resolveRuntimeEnv()
      const baseJobDir = buildJobDir(env.tempDir, jobId)
      const fullPath = resolveContainedPath(baseJobDir, artifactPath)
      if (!fullPath)
        return c.json({ error: 'Invalid artifact path' }, 400)

      const data = await readFile(fullPath)
      const ext = artifactPath.split('.').pop() ?? ''
      const mimeMap: Record<string, string> = {
        wav: 'audio/wav',
        mp3: 'audio/mpeg',
        json: 'application/json',
        npy: 'application/octet-stream',
      }
      return new Response(data, {
        headers: { 'Content-Type': mimeMap[ext] ?? 'application/octet-stream' },
      })
    }
    catch {
      return c.json({ error: 'Artifact not found' }, 404)
    }
  })

  app.route('/', authed)
  return app
}
