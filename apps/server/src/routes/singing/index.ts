import type {
  CreateCoverRequest,
  CreateTrainRequest,
  SingingHealthResponse,
  SingingModelsResponse,
} from '@proj-airi/singing/types'

import type { SingingService } from '../../services/singing/singing-service'
import type { HonoEnv } from '../../types/hono'

import process from 'node:process'

import { createReadStream, existsSync, statSync } from 'node:fs'
import { mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import {
  buildJobDir,
  buildUploadsDir,
  checkBaseModels,
  checkPythonRuntimePackages,
  getSafeUploadExtension,
  resolveContainedPath,
  resolveRuntimeEnv,
  SingingError,
  SingingErrorCode,
  writeMultipartFileToDisk,
} from '@proj-airi/singing'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { safeParse } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { createBadRequestError } from '../../utils/error'
import { CreateCoverJsonSchema, CreateCoverMultipartSchema, CreateCoverReferenceSchema, CreateTrainMultipartSchema, CreateTrainSchema } from './schema'

const SINGING_BODY_LIMIT = 100 * 1024 * 1024
const RANGE_HEADER_REGEX = /bytes=(\d*)-(\d*)/i

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

function createArtifactResponse(fullPath: string, ext: string, rangeHeader: string | undefined): Response {
  const mimeMap: Record<string, string> = {
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    json: 'application/json',
    npy: 'application/octet-stream',
  }
  const contentType = mimeMap[ext] ?? 'application/octet-stream'
  const stats = statSync(fullPath)
  const baseHeaders = {
    'Accept-Ranges': 'bytes',
    'Content-Type': contentType,
  }

  if (!rangeHeader) {
    return new Response(Readable.toWeb(createReadStream(fullPath)) as unknown as ReadableStream<Uint8Array>, {
      headers: {
        ...baseHeaders,
        'Content-Length': String(stats.size),
      },
    })
  }

  const match = rangeHeader.match(RANGE_HEADER_REGEX)
  if (!match) {
    return new Response(Readable.toWeb(createReadStream(fullPath)) as unknown as ReadableStream<Uint8Array>, {
      headers: {
        ...baseHeaders,
        'Content-Length': String(stats.size),
      },
    })
  }

  const hasExplicitStart = match[1] !== ''
  const hasExplicitEnd = match[2] !== ''

  let start = 0
  let end = stats.size - 1

  if (!hasExplicitStart && !hasExplicitEnd) {
    return new Response(null, {
      status: 416,
      headers: {
        ...baseHeaders,
        'Content-Range': `bytes */${stats.size}`,
      },
    })
  }

  if (!hasExplicitStart) {
    const suffixLength = Number(match[2])
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return new Response(null, {
        status: 416,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes */${stats.size}`,
        },
      })
    }

    start = Math.max(stats.size - suffixLength, 0)
  }
  else {
    start = Number(match[1])
    end = hasExplicitEnd ? Number(match[2]) : stats.size - 1
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end >= stats.size) {
    return new Response(null, {
      status: 416,
      headers: {
        ...baseHeaders,
        'Content-Range': `bytes */${stats.size}`,
      },
    })
  }

  return new Response(Readable.toWeb(createReadStream(fullPath, { start, end })) as unknown as ReadableStream<Uint8Array>, {
    status: 206,
    headers: {
      ...baseHeaders,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${stats.size}`,
    },
  })
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
    const pkgCheck = pythonOk
      ? await checkPythonRuntimePackages(env.pythonPath, env.pythonSrcDir)
      : { installed: false, missing: ['python runtime unavailable'] }
    const pythonReady = pythonOk && pkgCheck.installed
    const response: SingingHealthResponse = {
      status: ffmpegOk && pythonReady
        ? (baseModelsReady ? 'ready' : 'models_needed')
        : 'setup_required',
      setupSupported: false,
      ffmpeg: ffmpegOk,
      ffmpegPath: env.ffmpegPath,
      python: pythonOk,
      pythonPath: env.pythonPath,
      pythonVenv: pythonReady,
      pythonVenvExists: pythonOk,
      pythonPackagesInstalled: pkgCheck.installed,
      pythonPackagesMissing: pkgCheck.missing,
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
    let uploadedInputUri: string | null = null
    try {
      const user = c.get('user')!
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
        await writeMultipartFileToDisk(file, savedPath)
        uploadedInputUri = savedPath

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

      const response = await singingService.createCover(user.id, request)
      return c.json(response, 201)
    }
    catch (err) {
      if (uploadedInputUri)
        await unlink(uploadedInputUri).catch(() => {})

      if (err instanceof SingingError)
        return c.json({ error: err.message, code: err.code }, singingErrorToStatus(err.code) as any)

      throw err
    }
  })

  authed.post('/cover-reference', async (c) => {
    try {
      const user = c.get('user')!
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
      const response = await singingService.createCoverReference(user.id, request)
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
      const user = c.get('user')!
      const jobId = c.req.param('id')
      const response = await singingService.getJob(user.id, jobId)
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
      const user = c.get('user')!
      const jobId = c.req.param('id')
      const response = await singingService.cancelJob(user.id, jobId)
      return c.json(response)
    }
    catch (err) {
      if (err instanceof SingingError)
        return c.json({ error: err.message, code: err.code }, singingErrorToStatus(err.code) as any)

      throw err
    }
  })

  authed.post('/train', async (c) => {
    let uploadedDatasetUri: string | null = null
    try {
      const user = c.get('user')!
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
        await writeMultipartFileToDisk(file, datasetUri)
        uploadedDatasetUri = datasetUri

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

      const response = await singingService.createTrain(user.id, request)
      return c.json(response, 201)
    }
    catch (err) {
      if (uploadedDatasetUri)
        await unlink(uploadedDatasetUri).catch(() => {})

      if (err instanceof SingingError)
        return c.json({ error: err.message, code: err.code }, singingErrorToStatus(err.code) as any)

      throw err
    }
  })

  authed.get('/artifacts/:jobId/:path{.+}', async (c) => {
    const jobId = c.req.param('jobId')
    const artifactPath = c.req.param('path')
    try {
      const user = c.get('user')!
      await singingService.getJob(user.id, jobId)
      const env = resolveRuntimeEnv()
      const baseJobDir = buildJobDir(env.tempDir, jobId)
      const fullPath = resolveContainedPath(baseJobDir, artifactPath)
      if (!fullPath)
        return c.json({ error: 'Invalid artifact path' }, 400)
      if (!existsSync(fullPath) || !statSync(fullPath).isFile())
        return c.json({ error: 'Artifact not found' }, 404)

      const ext = artifactPath.split('.').pop() ?? ''
      return createArtifactResponse(fullPath, ext, c.req.header('range'))
    }
    catch {
      return c.json({ error: 'Artifact not found' }, 404)
    }
  })

  app.route('/', authed)
  return app
}
