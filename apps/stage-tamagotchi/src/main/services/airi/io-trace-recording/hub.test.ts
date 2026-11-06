import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { IOTraceRecordingService } from '.'
import { IOTraceHub } from '../io-trace-hub'
import { recordHubRecords } from './hub'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'airi-io-trace-hub-'))
  directories.push(root)
  let stored = false
  const hub = new IOTraceHub({ getStoredCollecting: () => true, setStoredCollecting: () => {}, now: () => 1000 })
  const service = new IOTraceRecordingService({
    directory: join(root, 'io-traces'),
    getStoredEnabled: () => stored,
    setStoredEnabled: (enabled) => {
      stored = enabled
    },
  })
  return { hub, service }
}

describe('recordHubRecords', () => {
  it('wants all tracks only while recording is on, so producers skip series that nobody shows', async () => {
    const { hub, service } = await setup()
    const stop = recordHubRecords(hub, service, (error) => {
      throw error
    })

    expect(hub.wantedTracks).toEqual([])

    await service.setEnabled(true)
    expect(hub.wantedTracks).toBe('*')

    await service.setEnabled(false)
    expect(hub.wantedTracks).toEqual([])

    stop()
  })
})
