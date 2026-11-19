import type { TraceRecord } from '@proj-airi/trace-kit'

import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { IOTraceRecordingService } from '.'

const directories: string[] = []

function record(name: string, attrs?: Record<string, string>): TraceRecord {
  return { type: 'instant', source: 'window:a', epoch: 'e1', seq: 0, ts: 1, clock: 'mono:collector', track: 't', name, ...(attrs ? { attrs } : {}) }
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
    sensitivityOf: key => key === 'asr.text' ? 'content' : undefined,
  })
  return { directory, service, stored: () => stored }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

describe('iOTraceRecordingService', () => {
  it('appends records as JSON Lines only while recording and keeps the setting on dispose', async () => {
    const { directory, service, stored } = await createService()

    await service.recordRecord(record('before'))
    const started = await service.setEnabled(true)
    await Promise.all([service.recordRecord(record('first')), service.recordRecord(record('second'))])
    await service.setEnabled(false)
    await service.recordRecord(record('after'))

    expect(started.filePath).toBeDefined()
    const lines = (await readFile(started.filePath!, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    expect(lines.map(line => line.name)).toEqual(['first', 'second'])
    expect(await readdir(directory)).toHaveLength(1)
    expect(stored()).toBe(false)

    await service.setEnabled(true)
    await service.dispose()
    expect(stored()).toBe(true)
    expect(service.getState().enabled).toBe(false)
  })

  it('removes content attributes from recorded records', async () => {
    const { service } = await createService()
    const started = await service.setEnabled(true)

    await service.recordRecord(record('asr', { 'asr.text': 'hello', 'other': 'kept' }))

    const [line] = (await readFile(started.filePath!, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    expect(line.attrs).toEqual({ other: 'kept' })
  })

  it('writes flight dumps to their own files and appends an overlapping dump', async () => {
    const { directory, service } = await createService()

    await service.writeFlightDump({ records: [record('a')], append: false, reason: 'error', from: 0, to: 1 })
    await service.writeFlightDump({ records: [record('b')], append: true, reason: 'error', from: 1, to: 2 })
    await service.writeFlightDump({ records: [record('c')], append: false, reason: 'overdue', from: 100, to: 200 })

    const files = (await readdir(directory)).sort()
    expect(files).toHaveLength(2)
    expect(files.every(name => name.startsWith('flight-'))).toBe(true)
    const errorFile = files.find(name => name.startsWith('flight-error-'))!
    const names = (await readFile(join(directory, errorFile), 'utf8')).trim().split('\n').map(line => JSON.parse(line).name)
    expect(names).toEqual(['a', 'b'])
  })

  it('removes files older than seven days when a flight dump starts while recording is off', async () => {
    const { directory, service } = await createService()
    await service.writeFlightDump({ records: [record('first')], append: false, reason: 'error', from: 0, to: 1 })
    const stale = join(directory, 'flight-error-stale.jsonl')
    await writeFile(stale, '{}\n')
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    await utimes(stale, old, old)

    await service.writeFlightDump({ records: [record('second')], append: false, reason: 'overdue', from: 100, to: 200 })

    expect(service.getState().enabled).toBe(false)
    expect(await readdir(directory)).not.toContain('flight-error-stale.jsonl')
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
