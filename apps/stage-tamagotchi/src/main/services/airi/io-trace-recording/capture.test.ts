import type { SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { IOTraceCaptureWriter, readIOTraceCapture, readLatestIOTraceCapture } from './capture'

const temporaryDirectories: string[] = []

function span(overrides: Partial<SerializedIOSpan> = {}): SerializedIOSpan {
  return {
    attributes: { 'ai.moeru.airi.io.subsystem': 'llm' },
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

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'airi-io-trace-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

describe('iOTraceCaptureWriter', () => {
  it('writes an append-only capture that the CLI reader can inspect while active and after stop', async () => {
    const directory = join(await temporaryDirectory(), 'io-traces')
    const writer = await IOTraceCaptureWriter.start({
      capturesDirectory: directory,
      captureId: 'capture-1',
      now: () => new Date('2026-10-02T08:00:00.000Z'),
    })

    await writer.appendSpan(span())
    await writer.appendSpan(span({
      name: 'tool.call',
      parentSpanId: 'span-1',
      spanId: 'span-2',
      status: { code: 2, message: 'tool failed' },
    }))

    await expect(readLatestIOTraceCapture(directory)).resolves.toMatchObject({
      active: true,
      captureId: 'capture-1',
      spanCount: 2,
    })

    const activeCapture = await readIOTraceCapture(writer.captureDirectory)
    expect(activeCapture.manifest).toEqual({
      captureId: 'capture-1',
      spanCount: 2,
      startedAt: '2026-10-02T08:00:00.000Z',
      version: 1,
    })
    expect(activeCapture.spans.map(item => item.span.name)).toEqual(['llm.stream', 'tool.call'])
    expect(activeCapture.spans[1]?.recordedAt).toBe('2026-10-02T08:00:00.000Z')

    await writer.stop()

    await expect(readLatestIOTraceCapture(directory)).resolves.toMatchObject({
      active: false,
      captureId: 'capture-1',
      spanCount: 2,
    })
    await expect(readIOTraceCapture(writer.captureDirectory)).resolves.toMatchObject({
      manifest: {
        captureId: 'capture-1',
        spanCount: 2,
        startedAt: '2026-10-02T08:00:00.000Z',
        stoppedAt: '2026-10-02T08:00:00.000Z',
        version: 1,
      },
    })

    const lines = (await readFile(join(writer.captureDirectory, 'spans.jsonl'), 'utf8')).trim().split('\n')
    expect(lines).toHaveLength(2)
  })

  it('rejects unfinished spans instead of persisting ambiguous records', async () => {
    const directory = await temporaryDirectory()
    const writer = await IOTraceCaptureWriter.start({
      capturesDirectory: directory,
      captureId: 'capture-2',
    })

    await expect(writer.appendSpan(span({ ended: false, endTimeNano: '0' })))
      .rejects
      .toThrow('Only ended IO spans can be recorded')

    await writer.stop()
  })
})
