import type { SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { IOTraceRecordingService } from '.'
import { readLatestIOTraceCapture } from './capture'

const temporaryDirectories: string[] = []

function endedSpan(): SerializedIOSpan {
  return {
    attributes: {},
    ended: true,
    endTimeNano: '2',
    events: [],
    kind: 0,
    name: 'interaction.turn',
    parentSpanId: '',
    spanId: 'span-1',
    startTimeNano: '1',
    status: { code: 1, message: '' },
    traceId: 'trace-1',
  }
}

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'airi-io-trace-service-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

describe('iOTraceRecordingService', () => {
  it('restores the persisted preference, records spans, and keeps the preference during shutdown', async () => {
    const capturesDirectory = await temporaryDirectory()
    const setStoredEnabled = vi.fn()
    const stateListener = vi.fn()
    const service = new IOTraceRecordingService({
      capturesDirectory,
      getStoredEnabled: () => true,
      setStoredEnabled,
    })
    service.onStateChange(stateListener)

    await service.restore()
    expect(service.getState()).toMatchObject({
      capturesDirectory,
      enabled: true,
    })
    expect(setStoredEnabled).not.toHaveBeenCalled()

    await expect(service.recordSpan(endedSpan())).resolves.toBe(true)
    await expect(service.getRecordedSpans()).resolves.toEqual([endedSpan()])
    await expect(readLatestIOTraceCapture(capturesDirectory)).resolves.toMatchObject({ spanCount: 1 })

    await service.dispose()
    expect(setStoredEnabled).not.toHaveBeenCalled()
    expect(stateListener).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }))
    await expect(readLatestIOTraceCapture(capturesDirectory)).resolves.toMatchObject({
      active: false,
      spanCount: 1,
    })
  })

  it('uses one main-owned switch and explicitly rejects a late span after recording stops', async () => {
    const capturesDirectory = await temporaryDirectory()
    let storedEnabled = false
    const service = new IOTraceRecordingService({
      capturesDirectory,
      getStoredEnabled: () => storedEnabled,
      setStoredEnabled: (enabled) => {
        storedEnabled = enabled
      },
    })

    const enabled = await service.setEnabled(true)
    expect(enabled.enabled).toBe(true)
    expect(enabled.captureId).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(storedEnabled).toBe(true)

    const disabled = await service.setEnabled(false)
    expect(disabled).toEqual({
      capturesDirectory,
      enabled: false,
    })
    expect(storedEnabled).toBe(false)
    await expect(service.recordSpan(endedSpan())).resolves.toBe(false)
  })
})
