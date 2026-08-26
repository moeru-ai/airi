import type { ExecutionTarget, ScreenshotArtifact } from '../types'

import { Buffer } from 'node:buffer'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { platform } from 'node:process'

import { errorMessageFromValue } from './error-message'
import { runProcess, sanitizeFileSegment } from './process'

const placeholderPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pP8WwAAAABJRU5ErkJggg=='

export async function captureScreenshotArtifact(params: {
  executionTarget?: ExecutionTarget
  label?: string
  screenshotBinary: string
  screenshotsDir: string
  timeoutMs: number
}): Promise<ScreenshotArtifact> {
  const fileName = `${Date.now()}-${sanitizeFileSegment(params.label, 'desktop')}.png`
  const outputPath = join(params.screenshotsDir, fileName)

  try {
    if (platform !== 'darwin') {
      throw new Error('real screenshots are only implemented for host-side macOS dry-run capture')
    }

    await runProcess(params.screenshotBinary, ['-x', outputPath], {
      timeoutMs: params.timeoutMs,
    })

    const buffer = await readFile(outputPath)
    return buildScreenshotArtifact({
      buffer,
      capturedAt: new Date().toISOString(),
      executionTarget: params.executionTarget,
      outputPath,
    })
  }
  catch (error) {
    const buffer = Buffer.from(placeholderPngBase64, 'base64')
    return await persistScreenshotBuffer({
      buffer,
      executionTarget: params.executionTarget,
      label: params.label,
      note: errorMessageFromValue(error),
      placeholder: true,
      screenshotsDir: params.screenshotsDir,
    })
  }
}

export async function writeScreenshotArtifact(params: {
  dataBase64: string
  executionTarget?: ExecutionTarget
  label?: string
  note?: string
  publicUrl?: string
  screenshotsDir: string
}): Promise<ScreenshotArtifact> {
  const buffer = Buffer.from(params.dataBase64, 'base64')

  return await persistScreenshotBuffer({
    buffer,
    executionTarget: params.executionTarget,
    label: params.label,
    note: params.note,
    publicUrl: params.publicUrl,
    screenshotsDir: params.screenshotsDir,
  })
}

function buildScreenshotArtifact(params: {
  buffer: Buffer
  capturedAt: string
  executionTarget?: ExecutionTarget
  note?: string
  outputPath: string
  placeholder?: boolean
  publicUrl?: string
}): ScreenshotArtifact {
  const dimensions = readPngDimensions(params.buffer)

  return {
    capturedAt: params.capturedAt,
    dataBase64: params.buffer.toString('base64'),
    executionTargetMode: params.executionTarget?.mode,
    mimeType: 'image/png',
    note: params.note,
    observationRef: `screenshot:${basename(params.outputPath)}`,
    path: params.outputPath,
    placeholder: params.placeholder ?? false,
    publicUrl: params.publicUrl,
    sourceDisplayId: params.executionTarget?.displayId,
    sourceHostName: params.executionTarget?.hostName,
    sourceSessionTag: params.executionTarget?.sessionTag,
    ...dimensions,
  }
}

async function persistScreenshotBuffer(params: {
  buffer: Buffer
  executionTarget?: ExecutionTarget
  label?: string
  note?: string
  placeholder?: boolean
  publicUrl?: string
  screenshotsDir: string
}): Promise<ScreenshotArtifact> {
  const capturedAt = new Date().toISOString()
  const fileName = `${Date.now()}-${sanitizeFileSegment(params.label, 'desktop')}.png`
  const outputPath = join(params.screenshotsDir, fileName)

  await writeFile(outputPath, params.buffer)

  return buildScreenshotArtifact({
    buffer: params.buffer,
    capturedAt,
    executionTarget: params.executionTarget,
    note: params.note,
    outputPath,
    placeholder: params.placeholder,
    publicUrl: params.publicUrl,
  })
}

function readPngDimensions(buffer: Buffer) {
  if (buffer.length < 24)
    return {}

  const signature = buffer.subarray(0, 8).toString('hex')
  if (signature !== '89504e470d0a1a0a')
    return {}

  return {
    height: buffer.readUInt32BE(20),
    width: buffer.readUInt32BE(16),
  }
}
