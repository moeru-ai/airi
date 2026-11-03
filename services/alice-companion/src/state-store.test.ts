import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createInitialState } from './companion-state'
import { StateStore } from './state-store'

let dataDir: string

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'alice-companion-'))
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
})

function state(revision: number) {
  return { ...createInitialState({ personaId: 'alice', ownerProfileId: 'default', at: new Date('2026-11-03T12:00:00Z') }), revision }
}

describe('stateStore', () => {
  it('returns undefined before the first save', async () => {
    await expect(new StateStore(dataDir).load()).resolves.toBeUndefined()
  })

  it('saves, loads, and keeps the previous state as a backup', async () => {
    const store = new StateStore(dataDir)
    await store.save(state(1))
    await store.save(state(2))

    const loaded = await store.load()
    const backup = JSON.parse(await readFile(join(dataDir, 'state.json.bak'), 'utf8'))

    expect(loaded?.revision).toBe(2)
    expect(backup.revision).toBe(1)
  })

  it('refuses a damaged state file instead of starting empty', async () => {
    await writeFile(join(dataDir, 'state.json'), '{"schemaVersion": 1}', 'utf8')

    await expect(new StateStore(dataDir).load()).rejects.toThrow('Restore')
  })

  it('appends one audit line per entry', async () => {
    const store = new StateStore(dataDir)
    await store.appendAudit({ at: '2026-11-03T12:00:00.000Z', revision: 1, eventId: 'a', kind: 'mood', outcome: 'applied', changes: [] })
    await store.appendAudit({ at: '2026-11-03T12:00:01.000Z', revision: 1, eventId: 'b', kind: 'mood', outcome: 'unchanged', changes: [] })

    const lines = (await readFile(join(dataDir, 'audit.jsonl'), 'utf8')).trim().split('\n')

    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[1]).eventId).toBe('b')
  })

  it('allows only one live owner of a data directory', async () => {
    const first = new StateStore(dataDir)
    await first.acquireLock()

    await expect(new StateStore(dataDir).acquireLock()).rejects.toThrow('Another companion service')

    await first.releaseLock()
    await expect(new StateStore(dataDir).acquireLock()).resolves.toBeUndefined()
  })

  it('takes over a lock left by a process that no longer runs', async () => {
    // PID values near the 32-bit limit are not used by a live process on the test machine.
    await writeFile(join(dataDir, 'companion.lock'), '2147483646', 'utf8')

    await expect(new StateStore(dataDir).acquireLock()).resolves.toBeUndefined()
  })
})
