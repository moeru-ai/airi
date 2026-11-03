import type { CompanionPublisher } from './companion-service'
import type { CompanionEvent } from './contracts'

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CompanionService } from './companion-service'
import { defaultPolicy } from './companion-state'
import { StateStore } from './state-store'

let dataDir: string
let service: CompanionService | undefined

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'alice-companion-service-'))
})

afterEach(async () => {
  await service?.stop()
  service = undefined
  await rm(dataDir, { recursive: true, force: true })
})

function createPublisher() {
  return {
    publishState: vi.fn<CompanionPublisher['publishState']>(async () => {}),
    publishAffect: vi.fn<CompanionPublisher['publishAffect']>(async () => {}),
  }
}

async function startService(publisher: CompanionPublisher, personaId = 'alice') {
  const started = new CompanionService({
    store: new StateStore(dataDir),
    publisher,
    policy: defaultPolicy,
    personaId,
    ownerProfileId: 'default',
    now: () => new Date('2026-11-03T12:00:00Z'),
  })
  await started.start()
  service = started
  return started
}

function interaction(eventId: string): CompanionEvent {
  return { kind: 'interaction', eventId, at: new Date('2026-11-03T12:00:00Z'), site: 'mirror', origin: 'explicit', interrupted: false }
}

describe('companionService', () => {
  it('creates, saves, and publishes the initial state on start', async () => {
    const publisher = createPublisher()
    await startService(publisher)

    const stored = JSON.parse(await readFile(join(dataDir, 'state.json'), 'utf8'))

    expect(stored.personaId).toBe('alice')
    expect(publisher.publishState).toHaveBeenCalledTimes(1)
    expect(publisher.publishState.mock.calls[0][0].revision).toBe(0)
  })

  it('serializes concurrent events so no count is lost', async () => {
    const publisher = createPublisher()
    const started = await startService(publisher)

    await Promise.all(Array.from({ length: 50 }, (_, index) => started.handle(interaction(`turn-${index}`))))
    const stored = JSON.parse(await readFile(join(dataDir, 'state.json'), 'utf8'))

    expect(stored.time.totalInteractions).toBe(50)
    expect(stored.revision).toBe(50)
  })

  it('publishes the affect only when mood or energy changes', async () => {
    const publisher = createPublisher()
    const started = await startService(publisher)

    await started.handle({ kind: 'mood', eventId: 'm1', at: new Date('2026-11-03T12:00:00Z'), site: 'mirror', mood: 'happy', causes: [] })
    await started.handle({ kind: 'mood', eventId: 'm2', at: new Date('2026-11-03T12:00:00Z'), site: 'mirror', mood: 'happy', causes: [] })

    expect(publisher.publishAffect).toHaveBeenCalledTimes(1)
    expect(publisher.publishAffect.mock.calls[0][0].emotion).toBe('happy')
  })

  it('does not save or publish a duplicate event', async () => {
    const publisher = createPublisher()
    const started = await startService(publisher)

    await started.handle(interaction('same'))
    const outcome = await started.handle(interaction('same'))
    const auditLines = (await readFile(join(dataDir, 'audit.jsonl'), 'utf8')).trim().split('\n')

    expect(outcome).toBe('duplicate')
    expect(publisher.publishState).toHaveBeenCalledTimes(2)
    expect(auditLines).toHaveLength(1)
  })

  it('keeps the state after a restart', async () => {
    const first = await startService(createPublisher())
    await first.handle(interaction('before-restart'))
    await first.stop()

    const second = await startService(createPublisher())
    const outcome = await second.handle(interaction('before-restart'))

    expect(outcome).toBe('duplicate')
  })

  it('refuses a state file of another persona', async () => {
    const first = await startService(createPublisher())
    await first.stop()

    await expect(startService(createPublisher(), 'other')).rejects.toThrow('belongs to persona "alice"')
  })

  it('keeps the saved state when publishing fails', async () => {
    const publisher = createPublisher()
    const started = await startService(publisher)
    publisher.publishState.mockRejectedValueOnce(new Error('broker down'))

    await expect(started.handle(interaction('while-offline'))).resolves.toBe('applied')
    const stored = JSON.parse(await readFile(join(dataDir, 'state.json'), 'utf8'))

    expect(stored.time.totalInteractions).toBe(1)
  })
})
