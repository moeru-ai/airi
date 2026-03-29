import type { CreateCoverRequest } from '@proj-airi/singing/types'

import type { SingingService } from '../../services/singing/singing-service'
import type { HonoEnv } from '../../types/hono'

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { buildJobDir, resolveContainedPath, resolveRuntimeEnv, SingingError, SingingErrorCode } from '@proj-airi/singing'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { safeParse } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { createBadRequestError } from '../../utils/error'
import { CreateCoverJsonSchema, CreateCoverMultipartSchema, CreateCoverReferenceSchema, CreateTrainSchema } from './schema'

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

/**
 * [singing] Routes for the AI singing voice conversion module.
 */
export function createSingingRoutes(singingService: SingingService) {
  const app = new Hono<HonoEnv>()

  app.get('/health', async (c) => {
    const env = resolveRuntimeEnv()
    const [ffmpegOk, pythonOk] = await Promise.all([
      checkBinaryExists(env.ffmpegPath, ['-version']),
      checkBinaryExists(env.pythonPath, ['--version']),
    ])
    return c.json({
      status: ffmpegOk && pythonOk ? 'ready' : 'degraded',
      ffmpeg: ffmpegOk,
      python: pythonOk,
      modelsDir: env.modelsDir,
    })
  })

  app.get('/models', async (c) => {
    const env = resolveRuntimeEnv()
    const { listVoices } = await import('@proj-airi/singing')
    const result = await listVoices({ modelsDir: env.modelsDir })
    return c.json(result)
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

        let params: Record<string, unknown>
        try {
          params = paramsRaw ? JSON.parse(paramsRaw) : {}
        }
        catch {
          throw createBadRequestError('Invalid JSON in params field', 'INVALID_JSON')
        }

        const result = safeParse(CreateCoverMultipartSchema, params)
        if (!result.success)
          throw createBadRequestError('Invalid cover request', 'INVALID_REQUEST', result.issues)

        const { buildUploadsDir, resolveRuntimeEnv: resolveEnv } = await import('@proj-airi/singing')
        const runtimeEnv = resolveEnv()
        const { randomUUID } = await import('node:crypto')

        const uploadsDir = buildUploadsDir(runtimeEnv.tempDir)
        await mkdir(uploadsDir, { recursive: true })

        const uploadId = randomUUID()
        const ext = file.name.split('.').pop() ?? 'wav'
        const savedPath = join(uploadsDir, `${uploadId}.${ext}`)
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
      const body = await c.req.json()
      const result = safeParse(CreateTrainSchema, body)
      if (!result.success)
        throw createBadRequestError('Invalid train request', 'INVALID_REQUEST', result.issues)

      const response = await singingService.createTrain(result.output)
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
