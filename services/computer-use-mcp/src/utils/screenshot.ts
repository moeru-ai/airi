import type { ExecutionTarget, ScreenshotArtifact } from '../types'

import { Buffer } from 'node:buffer'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { platform } from 'node:process'

import { runProcess, sanitizeFileSegment } from './process'

const placeholderPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pP8WwAAAABJRU5ErkJggg=='

function readPngDimensions(buffer: Buffer) {
  if (buffer.length < 24)
    return {}

  const signature = buffer.subarray(0, 8).toString('hex')
  if (signature !== '89504e470d0a1a0a')
    return {}

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

function buildScreenshotArtifact(params: {
  outputPath: string
  buffer: Buffer
  capturedAt: string
  publicUrl?: string
  note?: string
  placeholder?: boolean
  executionTarget?: ExecutionTarget
}): ScreenshotArtifact {
  const dimensions = readPngDimensions(params.buffer)

  return {
    dataBase64: params.buffer.toString('base64'),
    mimeType: 'image/png',
    path: params.outputPath,
    publicUrl: params.publicUrl,
    observationRef: `screenshot:${basename(params.outputPath)}`,
    capturedAt: params.capturedAt,
    placeholder: params.placeholder ?? false,
    note: params.note,
    executionTargetMode: params.executionTarget?.mode,
    sourceHostName: params.executionTarget?.hostName,
    sourceDisplayId: params.executionTarget?.displayId,
    sourceSessionTag: params.executionTarget?.sessionTag,
    ...dimensions,
  }
}

async function persistScreenshotBuffer(params: {
  label?: string
  screenshotsDir: string
  buffer: Buffer
  publicUrl?: string
  note?: string
  placeholder?: boolean
  executionTarget?: ExecutionTarget
}): Promise<ScreenshotArtifact> {
  const capturedAt = new Date().toISOString()
  const fileName = `${Date.now()}-${sanitizeFileSegment(params.label, 'desktop')}.png`
  const outputPath = join(params.screenshotsDir, fileName)

  await writeFile(outputPath, params.buffer)

  return buildScreenshotArtifact({
    outputPath,
    buffer: params.buffer,
    capturedAt,
    publicUrl: params.publicUrl,
    note: params.note,
    placeholder: params.placeholder,
    executionTarget: params.executionTarget,
  })
}

export async function writeScreenshotArtifact(params: {
  label?: string
  screenshotsDir: string
  dataBase64: string
  publicUrl?: string
  note?: string
  executionTarget?: ExecutionTarget
}): Promise<ScreenshotArtifact> {
  const buffer = Buffer.from(params.dataBase64, 'base64')

  return await persistScreenshotBuffer({
    label: params.label,
    screenshotsDir: params.screenshotsDir,
    buffer,
    publicUrl: params.publicUrl,
    note: params.note,
    executionTarget: params.executionTarget,
  })
}

export async function captureScreenshotArtifact(params: {
  label?: string
  screenshotsDir: string
  screenshotBinary: string
  timeoutMs: number
  executionTarget?: ExecutionTarget
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
      outputPath,
      buffer,
      capturedAt: new Date().toISOString(),
      executionTarget: params.executionTarget,
    })
  }
  catch (error) {
    const buffer = Buffer.from(placeholderPngBase64, 'base64')
    return await persistScreenshotBuffer({
      label: params.label,
      screenshotsDir: params.screenshotsDir,
      buffer,
      placeholder: true,
      note: error instanceof Error ? error.message : String(error),
      executionTarget: params.executionTarget,
    })
  }
}
