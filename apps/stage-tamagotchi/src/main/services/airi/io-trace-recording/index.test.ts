import type { SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'

import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { IOTraceRecordingService } from '.'

const directories: string[] = []

function span(spanId: string): SerializedIOSpan {
  return {
    attributes: {},
    ended: true,
    endTimeNano: '3000000',
    events: [],
    kind: 0,
    name: 'llm.stream',
    parentSpanId: '',
    spanId,
    startTimeNano: '1000000',
    status: { code: 1, message: '' },
    traceId: 'trace-1',
  }
}

async function createService(initiallyEnabled = false) {
  const root = await mkdtemp(join(tmpdir(), 'airi-io-trace-'))
  directories.push(root)
  const directory = join(root, 'io-traces')
  let stored = initiallyEnabled
  const service = new IOTraceRecordingService({
    directory,
    getStoredEnabled: () => stored,
    setStoredEnabled: (enabled) => {
      stored = enabled
    },
  })
  return { directory, service, stored: () => stored }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

describe('iOTraceRecordingService', () => {
  it('appends ended spans as JSON Lines only while recording and keeps the setting on dispose', async () => {
    const { directory, service, stored } = await createService()

    await service.recordSpan(span('before'))
    const started = await service.setEnabled(true)
    await Promise.all([service.recordSpan(span('first')), service.recordSpan(span('second'))])
    await service.setEnabled(false)
    await service.recordSpan(span('after'))

    expect(started.filePath).toBeDefined()
    const lines = (await readFile(started.filePath!, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    expect(lines.map(line => line.spanId)).toEqual(['first', 'second'])
    expect(await readdir(directory)).toHaveLength(1)
    expect(stored()).toBe(false)

    await service.setEnabled(true)
    await service.dispose()
    expect(stored()).toBe(true)
    expect(service.getState().enabled).toBe(false)
  })

  it('restores the stored setting and removes files older than seven days', async () => {
    const { directory, service } = await createService()
    await service.setEnabled(true)
    await service.dispose()
    const stale = join(directory, 'stale.jsonl')
    await writeFile(stale, '{}\n')
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    await utimes(stale, old, old)

    await service.restore()

    expect(service.getState().enabled).toBe(true)
    expect(await readdir(directory)).not.toContain('stale.jsonl')
  })
})
