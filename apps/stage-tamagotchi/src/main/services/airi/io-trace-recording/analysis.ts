import type { IOTraceCapture, IOTraceCaptureManifest } from './capture'

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { readIOTraceCapture, readLatestIOTraceCapture } from './capture'

const SUBSYSTEM_ATTRIBUTE = 'ai.moeru.airi.io.subsystem'
const ERROR_STATUS_CODE = 2

export interface IOTraceCaptureListItem extends IOTraceCaptureManifest {
  active: boolean
  captureDirectory: string
}

export interface IOTraceCaptureSummary {
  captureId: string
  durationMs: number
  errorSpanCount: number
  spansByName: Record<string, number>
  spansBySubsystem: Record<string, number>
  spanCount: number
  traceCount: number
}

function increment(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1
}

export function summarizeIOTraceCapture(capture: IOTraceCapture): IOTraceCaptureSummary {
  const spansByName: Record<string, number> = {}
  const spansBySubsystem: Record<string, number> = {}
  const traceIds = new Set<string>()
  let earliestStart: bigint | undefined
  let latestEnd: bigint | undefined
  let errorSpanCount = 0

  for (const { span } of capture.spans) {
    traceIds.add(span.traceId)
    increment(spansByName, span.name)
    const subsystem = span.attributes[SUBSYSTEM_ATTRIBUTE]
    increment(spansBySubsystem, typeof subsystem === 'string' ? subsystem : 'unknown')
    if (span.status.code === ERROR_STATUS_CODE)
      errorSpanCount++

    const start = BigInt(span.startTimeNano)
    const end = BigInt(span.endTimeNano)
    if (earliestStart === undefined || start < earliestStart)
      earliestStart = start
    if (latestEnd === undefined || end > latestEnd)
      latestEnd = end
  }

  return {
    captureId: capture.manifest.captureId,
    durationMs: earliestStart === undefined || latestEnd === undefined
      ? 0
      : Number(latestEnd - earliestStart) / 1e6,
    errorSpanCount,
    spansByName,
    spansBySubsystem,
    spanCount: capture.spans.length,
    traceCount: traceIds.size,
  }
}

export async function listIOTraceCaptures(capturesDirectory: string): Promise<IOTraceCaptureListItem[]> {
  const entries = await readdir(capturesDirectory, { withFileTypes: true })
  const captureEntries = entries.filter(entry => entry.isDirectory())
  if (captureEntries.length === 0)
    return []

  const latest = await readLatestIOTraceCapture(capturesDirectory)
  const captures = await Promise.all(captureEntries
    .map(async (entry) => {
      const captureDirectory = join(capturesDirectory, entry.name)
      const { manifest } = await readIOTraceCapture(captureDirectory)
      return {
        ...manifest,
        active: latest.active && latest.captureId === manifest.captureId,
        captureDirectory,
      }
    }))

  return captures.sort((left, right) => right.startedAt.localeCompare(left.startedAt) || right.captureId.localeCompare(left.captureId))
}
