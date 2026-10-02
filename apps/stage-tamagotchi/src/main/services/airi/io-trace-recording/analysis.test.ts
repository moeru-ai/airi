import type { SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { listIOTraceCaptures, summarizeIOTraceCapture } from './analysis'
import { IOTraceCaptureWriter, readIOTraceCapture } from './capture'

const temporaryDirectories: string[] = []

function span(overrides: Partial<SerializedIOSpan>): SerializedIOSpan {
  return {
    attributes: {},
    ended: true,
    endTimeNano: '3000000',
    events: [],
    kind: 0,
    name: 'llm.stream',
    parentSpanId: '',
    spanId: 'span-1',
    startTimeNano: '1000000',
    status: { code: 1, message: '' },
    traceId: 'trace-1',
    ...overrides,
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

describe('iO trace analysis', () => {
  it('summarizes traces, errors, timing, and subsystem activity from the durable capture', async () => {
    const capturesDirectory = await mkdtemp(join(tmpdir(), 'airi-io-trace-analysis-'))
    temporaryDirectories.push(capturesDirectory)
    const writer = await IOTraceCaptureWriter.start({ capturesDirectory, captureId: 'capture-1' })
    await writer.appendSpan(span({ attributes: { 'ai.moeru.airi.io.subsystem': 'llm' } }))
    await writer.appendSpan(span({
      attributes: { 'ai.moeru.airi.io.subsystem': 'tool' },
      endTimeNano: '5000000',
      name: 'tool.call',
      spanId: 'span-2',
      startTimeNano: '3000000',
      status: { code: 2, message: 'failed' },
    }))

    const summary = summarizeIOTraceCapture(await readIOTraceCapture(writer.captureDirectory))
    expect(summary).toEqual({
      captureId: 'capture-1',
      durationMs: 4,
      errorSpanCount: 1,
      spansByName: { 'llm.stream': 1, 'tool.call': 1 },
      spansBySubsystem: { llm: 1, tool: 1 },
      spanCount: 2,
      traceCount: 1,
    })

    await writer.stop()
  })

  it('lists captures newest first and identifies the active capture', async () => {
    const capturesDirectory = await mkdtemp(join(tmpdir(), 'airi-io-trace-list-'))
    temporaryDirectories.push(capturesDirectory)
    const first = await IOTraceCaptureWriter.start({ capturesDirectory, captureId: 'capture-1' })
    await first.stop()
    const second = await IOTraceCaptureWriter.start({ capturesDirectory, captureId: 'capture-2' })

    await expect(listIOTraceCaptures(capturesDirectory)).resolves.toEqual([
      expect.objectContaining({ active: true, captureId: 'capture-2' }),
      expect.objectContaining({ active: false, captureId: 'capture-1' }),
    ])

    await second.stop()
  })
})
