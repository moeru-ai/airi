import type { Routine } from '@proj-airi/stage-ui/libs/routines/model'

import { Buffer } from 'node:buffer'
import { mkdtemp, readFile, rename, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { importMaru } from '@proj-airi/stage-ui/libs/routines/maru'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RoutineRuntime } from './runtime'

const filesystemFault = vi.hoisted(() => ({ directorySync: false }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args)
      if (filesystemFault.directorySync && (await handle.stat()).isDirectory())
        vi.spyOn(handle, 'sync').mockRejectedValueOnce(new Error('directory-sync-failed'))
      return handle
    },
  }
})

const roots: string[] = []
const instances: RoutineRuntime[] = []
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'airi-maru-test-'))
  roots.push(root)
  const runtime = new RoutineRuntime(root)
  instances.push(runtime)
  await runtime.load()
  return { runtime, root }
}
function routine(entries: unknown[] = [['睡眠', 120, 255, 0], ['study', 1200, 1260, 1]]): Routine {
  const code = Buffer.from(JSON.stringify({ v: 1, t: 'My day', s: '', c: 2, e: entries })).toString('base64url')
  return importMaru(`https://kxn4t.github.io/maru-ichinichi/#d=${code}`, 'America/Sao_Paulo')
}
async function save(runtime: RoutineRuntime, value = routine()) {
  return runtime.apply({ kind: 'save', expectedRevision: (await runtime.read()).state.revision, routine: value, replace: false })
}
afterEach(() => {
  filesystemFault.directorySync = false
  for (const runtime of instances.splice(0)) runtime.dispose()
})

describe('profile-owned routine runtime', () => {
  it('keeps an existing profile inactive until explicit review even when an imported plan requests activation', async () => {
    const profile = await mkdtemp(join(tmpdir(), 'airi-routine-profile-'))
    const preferences = join(profile, 'preferences.json')
    const originalPreferences = JSON.stringify({ language: 'pt-BR' })
    await writeFile(preferences, originalPreferences)
    const root = join(profile, 'routines')
    const runtime = new RoutineRuntime(root)
    instances.push(runtime)
    await runtime.load()
    expect((await runtime.read()).state.routine).toBeNull()
    const emit = vi.fn()
    const now = Date.parse('2026-10-21T22:45:10Z')
    await runtime.tick(now, emit)
    expect(emit).not.toHaveBeenCalled()

    const imported = routine()
    imported.reviewed = true
    imported.shortSleepAcknowledged = true
    imported.enabled = true
    imported.remindersEnabled = true
    imported.activities[0].displayLabels = { 'pt-BR': 'Descanso' }
    const saved = await save(runtime, imported)
    expect(saved.routine?.reviewed).toBe(false)
    expect(saved.routine?.shortSleepAcknowledged).toBe(false)
    expect(saved.routine?.enabled).toBe(false)
    expect(saved.routine?.remindersEnabled).toBe(false)
    await expect(runtime.apply({ kind: 'configure', expectedRevision: 1, reviewed: false, shortSleepAcknowledged: false, enabled: true, remindersEnabled: true, advanceMinutes: 15 })).rejects.toThrow()

    const restarted = new RoutineRuntime(root)
    instances.push(restarted)
    await restarted.load()
    expect((await restarted.read()).state).toEqual(saved)
    expect((await restarted.read()).state.routine?.activities[0].displayLabels).toEqual({ 'pt-BR': 'Descanso' })
    await restarted.tick(now, emit)
    expect(emit).not.toHaveBeenCalled()
    expect(await readFile(preferences, 'utf8')).toBe(originalPreferences)
  })

  it('persists inactive Japanese data across a new runtime and uses private permissions', async () => {
    const { runtime, root } = await setup()
    const saved = await save(runtime)
    const restarted = new RoutineRuntime(root)
    instances.push(restarted)
    await restarted.load()
    expect((await restarted.read()).state).toEqual(saved)
    expect(saved.routine?.enabled).toBe(false)
    expect((await stat(join(root, 'state.json'))).mode & 0o777).toBe(0o600)
    expect(saved.routine?.activities[0].label).toBe('睡眠')
  })

  it('requires explicit sleep review and refuses stale writes', async () => {
    const { runtime } = await setup()
    await save(runtime)
    const command = { kind: 'configure', expectedRevision: 1, reviewed: true, shortSleepAcknowledged: false, enabled: true, remindersEnabled: false, advanceMinutes: 15 }
    await expect(runtime.apply(command)).rejects.toThrow()
    await runtime.apply({ ...command, shortSleepAcknowledged: true })
    await expect(runtime.apply(command)).rejects.toThrow('stale-revision')
    expect((await runtime.read()).state.routine?.enabled).toBe(true)
  })

  it('refuses overlap edits without corrupting persisted data', async () => {
    const { runtime, root } = await setup()
    const saved = await save(runtime)
    const before = await readFile(join(root, 'state.json'), 'utf8')
    const edited = structuredClone(saved.routine!)
    edited.activities[1].start = 130
    await expect(runtime.apply({ kind: 'save', expectedRevision: 1, routine: edited, replace: false })).rejects.toThrow()
    expect(await readFile(join(root, 'state.json'), 'utf8')).toBe(before)
  })

  it('rejects replacement without explicit consent and resolves simultaneous writes', async () => {
    const { runtime } = await setup()
    await save(runtime)
    await expect(runtime.apply({ kind: 'save', expectedRevision: 1, routine: routine(), replace: false })).rejects.toThrow('replacement-confirmation-required')
    const results = await Promise.allSettled([
      runtime.apply({ kind: 'pause', expectedRevision: 1, until: Date.now() + 60000 }),
      runtime.apply({ kind: 'pause', expectedRevision: 1, until: Date.now() + 120000 }),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  })

  it('keeps conversational writes pending until UI confirmation and detects stale proposals', async () => {
    const { runtime } = await setup()
    const saved = await save(runtime)
    const now = Date.parse('2026-10-21T13:00:00Z')
    const id = saved.routine!.activities[1].id
    const proposal = await runtime.propose({ kind: 'postpone', activityId: id, date: '2026-10-21', start: 1260 }, now)
    expect((await runtime.read(now)).state.overrides).toHaveLength(0)
    await runtime.confirm(proposal.id, now)
    expect((await runtime.read(now)).state.overrides[0]).toMatchObject({ start: 1260, end: 1320 })
    const second = await runtime.propose({ kind: 'mute-today' }, now)
    await runtime.apply({ kind: 'pause', expectedRevision: 2, until: now + 60000 })
    await expect(runtime.confirm(second.id, now)).rejects.toThrow('stale-revision')
  })

  it('expires proposals and records completion without rewriting the plan', async () => {
    const { runtime } = await setup()
    const saved = await save(runtime)
    const now = Date.parse('2026-10-21T23:10:00Z')
    const activityId = saved.routine!.activities[1].id
    const expired = await runtime.propose({ kind: 'complete', activityId, date: '2026-10-21' }, now)
    await expect(runtime.confirm(expired.id, now + 301000)).rejects.toThrow('expired-proposal')
    const proposal = await runtime.propose({ kind: 'complete', activityId, date: '2026-10-21' }, now)
    await runtime.confirm(proposal.id, now)
    const view = await runtime.read(now)
    expect(view.schedule.current?.status).toBe('completed')
    expect(view.state.routine?.activities[1].start).toBe(1200)
  })

  it('claims once before notifying and preserves deduplication after restart', async () => {
    const { runtime, root } = await setup()
    await save(runtime)
    await runtime.apply({ kind: 'configure', expectedRevision: 1, reviewed: true, shortSleepAcknowledged: true, enabled: true, remindersEnabled: true, advanceMinutes: 15 })
    const emit = vi.fn()
    const now = Date.parse('2026-10-21T22:45:10Z')
    await Promise.all([runtime.tick(now, emit), runtime.tick(now, emit)])
    expect(emit).toHaveBeenCalledTimes(1)
    const restarted = new RoutineRuntime(root)
    instances.push(restarted)
    await restarted.load()
    await restarted.tick(now + 1000, emit)
    expect(emit).toHaveBeenCalledTimes(1)
    expect((await restarted.read(now)).state.deliveries).toHaveLength(1)
  })

  it('does not emit when inactive, paused, muted, completed, suspended past the grace window, or time moves backwards', async () => {
    const { runtime } = await setup()
    await save(runtime)
    const emit = vi.fn()
    const now = Date.parse('2026-10-21T22:45:10Z')
    await runtime.tick(now, emit)
    expect(emit).not.toHaveBeenCalled()
    await runtime.apply({ kind: 'configure', expectedRevision: 1, reviewed: true, shortSleepAcknowledged: true, enabled: true, remindersEnabled: true, advanceMinutes: 15 })
    await runtime.tick(now + 120000, emit)
    expect(emit).not.toHaveBeenCalled()
    await runtime.apply({ kind: 'pause', expectedRevision: 2, until: now + 60000 })
    await runtime.tick(now, emit)
    expect(emit).not.toHaveBeenCalled()
    const proposal = await runtime.propose({ kind: 'mute-today' }, now)
    await runtime.confirm(proposal.id, now)
    await runtime.tick(now + 60000, emit)
    expect(emit).not.toHaveBeenCalled()
  })

  it('refuses corrupt data and symbolic links without overwriting either', async () => {
    const { root } = await setup()
    await writeFile(join(root, 'state.json'), '{broken')
    await expect(new RoutineRuntime(root).load()).rejects.toThrow()
    expect(await readFile(join(root, 'state.json'), 'utf8')).toBe('{broken')
    const other = await mkdtemp(join(tmpdir(), 'airi-maru-link-'))
    await symlink(join(root, 'state.json'), join(other, 'state.json'))
    await expect(new RoutineRuntime(other).load()).rejects.toThrow()
  })
})

it('delivers a zero-minute reminder once within the start grace window', async () => {
  const { runtime } = await setup()
  await save(runtime)
  await runtime.apply({ kind: 'configure', expectedRevision: 1, reviewed: true, shortSleepAcknowledged: true, enabled: true, remindersEnabled: true, advanceMinutes: 0 })
  const emit = vi.fn()
  const now = Date.parse('2026-10-21T23:00:10Z')
  await runtime.tick(now, emit)
  await runtime.tick(now + 1000, emit)
  expect(emit).toHaveBeenCalledTimes(1)
})

it('retains the previous snapshot if the filesystem refuses a write', async () => {
  const { runtime, root } = await setup()
  const saved = await save(runtime)
  await rename(root, `${root}-moved`)
  await writeFile(root, 'not a directory')
  await expect(runtime.apply({ kind: 'pause', expectedRevision: 1, until: Date.now() + 60000 })).rejects.toThrow()
  expect((await runtime.read()).state).toEqual(saved)
  expect(JSON.parse(await readFile(join(`${root}-moved`, 'state.json'), 'utf8'))).toEqual(saved)
})

it('records a failed display attempt without retrying it after restart', async () => {
  const { runtime, root } = await setup()
  await save(runtime)
  await runtime.apply({ kind: 'configure', expectedRevision: 1, reviewed: true, shortSleepAcknowledged: true, enabled: true, remindersEnabled: true, advanceMinutes: 15 })
  const now = Date.parse('2026-10-21T22:45:10Z')
  await expect(runtime.tick(now, () => {
    throw new Error('display failed')
  })).rejects.toThrow('display failed')
  const restarted = new RoutineRuntime(root)
  instances.push(restarted)
  await restarted.load()
  const emit = vi.fn()
  await restarted.tick(now + 1000, emit)
  await restarted.tick(now - 1000, emit)
  expect(emit).not.toHaveBeenCalled()
})

it('does not remind an explicitly completed occurrence', async () => {
  const { runtime } = await setup()
  const saved = await save(runtime)
  const now = Date.parse('2026-10-21T23:00:10Z')
  const activityId = saved.routine!.activities[1].id
  const proposal = await runtime.propose({ kind: 'complete', activityId, date: '2026-10-21' }, now)
  await runtime.confirm(proposal.id, now)
  await runtime.apply({ kind: 'configure', expectedRevision: 2, reviewed: true, shortSleepAcknowledged: true, enabled: true, remindersEnabled: true, advanceMinutes: 0 })
  const emit = vi.fn()
  await runtime.tick(now, emit)
  expect(emit).not.toHaveBeenCalled()
})

it('keeps the committed revision and blocks writes after an uncertain directory sync', async () => {
  const { runtime, root } = await setup()
  await save(runtime)
  filesystemFault.directorySync = true
  await expect(runtime.apply({ kind: 'pause', expectedRevision: 1, until: 123456 })).rejects.toThrow('directory-sync-failed')
  const disk = JSON.parse(await readFile(join(root, 'state.json'), 'utf8'))
  const view = await runtime.read()
  expect(view.state.revision).toBe(disk.revision)
  expect(view.state.routine?.pausedUntil).toBe(123456)
  expect(view.storageError).toBe('durability-unconfirmed')
  await expect(runtime.apply({ kind: 'pause', expectedRevision: disk.revision, until: 0 })).rejects.toThrow('durability-unconfirmed')
})

it('bounds delivery history without replaying retired claims after a clock rollback', async () => {
  const { runtime, root } = await setup()
  await save(runtime)
  const saved = await runtime.apply({ kind: 'configure', expectedRevision: 1, reviewed: true, shortSleepAcknowledged: true, enabled: true, remindersEnabled: true, advanceMinutes: 15 })
  saved.deliveries = Array.from({ length: 4096 }, (_, index) => `retired-${index}`)
  await writeFile(join(root, 'state.json'), JSON.stringify(saved))
  const restarted = new RoutineRuntime(root)
  instances.push(restarted)
  await restarted.load()
  const emit = vi.fn()
  const now = Date.parse('2026-10-21T22:45:10Z')
  await restarted.tick(now, emit)
  expect(emit).toHaveBeenCalledTimes(1)
  expect((await restarted.read()).state.deliveries).toHaveLength(4096)
  await restarted.tick(now - 86400000, emit)
  expect(emit).toHaveBeenCalledTimes(1)
})

it('persists activity edits, removes activities, and deletes the routine with new revisions', async () => {
  const { runtime, root } = await setup()
  await save(runtime)
  const active = await runtime.apply({ kind: 'configure', expectedRevision: 1, reviewed: true, shortSleepAcknowledged: true, enabled: true, remindersEnabled: false, advanceMinutes: 15 })
  const edited = structuredClone(active.routine!)
  edited.activities[1].label = 'Estudo'
  edited.activities[1].start = 1230
  edited.activities[1].days = [1, 3]
  edited.activities[1].color = '#123456'
  const saved = await runtime.apply({ kind: 'save', expectedRevision: 2, routine: edited, replace: false })
  expect(saved.routine?.enabled).toBe(false)
  expect(saved.routine?.reviewed).toBe(false)
  expect(saved.routine?.shortSleepAcknowledged).toBe(false)
  const reduced = structuredClone(saved.routine!)
  reduced.activities.splice(0, 1)
  await runtime.apply({ kind: 'save', expectedRevision: 3, routine: reduced, replace: false })
  const restarted = new RoutineRuntime(root)
  instances.push(restarted)
  await restarted.load()
  expect((await restarted.read()).state.routine?.activities).toHaveLength(1)
  expect((await restarted.read()).state.routine?.activities[0]).toMatchObject({ label: 'Estudo', days: [1, 3], color: '#123456' })
  await runtime.apply({ kind: 'delete', expectedRevision: 4 })
  expect(JSON.parse(await readFile(join(root, 'state.json'), 'utf8')).routine).toBeNull()
})

it('does not apply a today-only mute after midnight in the routine time zone', async () => {
  const { runtime } = await setup()
  await save(runtime)
  const now = Date.parse('2026-10-22T02:59:00Z')
  const proposal = await runtime.propose({ kind: 'mute-today' }, now)
  await expect(runtime.confirm(proposal.id, now + 120000)).rejects.toThrow('expired-local-day')
  expect((await runtime.read()).state.mutedDate).toBeNull()
})

it('refuses a corrupt zero-duration dated override without rewriting the file', async () => {
  const { runtime, root } = await setup()
  const saved = await save(runtime)
  const corrupted = {
    ...saved,
    overrides: [{ activityId: saved.routine!.activities[1].id, date: '2026-10-21', start: 1200, end: 1200 }],
  }
  const bytes = JSON.stringify(corrupted)
  await writeFile(join(root, 'state.json'), bytes)
  const restarted = new RoutineRuntime(root)
  instances.push(restarted)
  await expect(restarted.load()).rejects.toThrow('ambiguous-duration')
  expect(await readFile(join(root, 'state.json'), 'utf8')).toBe(bytes)
})

it('refuses unknown occurrence ids and dates before queuing a conversational proposal', async () => {
  const { runtime, root } = await setup()
  const saved = await save(runtime)
  const now = Date.parse('2026-10-21T13:00:00Z')
  const before = await readFile(join(root, 'state.json'), 'utf8')
  const activityId = saved.routine!.activities[1].id
  await expect(runtime.propose({ kind: 'postpone', activityId: `_${activityId}`, date: '2026-10-21', start: 1260 }, now)).rejects.toThrow('occurrence-unavailable')
  await expect(runtime.propose({ kind: 'complete', activityId, date: '2026-11-21' }, now)).rejects.toThrow('occurrence-unavailable')
  expect((await runtime.read(now)).proposals).toHaveLength(0)
  expect(await readFile(join(root, 'state.json'), 'utf8')).toBe(before)
})

it('preserves explicit display translations and source identities across restart without enabling the routine', async () => {
  const { runtime, root } = await setup()
  const value = routine()
  value.activities[0].displayLabels = { en: 'Night rest', fr: 'Repos nocturne' }
  const saved = await save(runtime, value)
  const restarted = new RoutineRuntime(root)
  instances.push(restarted)
  await restarted.load()
  expect((await restarted.read()).state).toEqual(saved)
  expect((await restarted.read()).state.routine?.activities[0]).toMatchObject({ id: value.activities[0].id, label: '睡眠', category: 'sleep', displayLabels: { en: 'Night rest', fr: 'Repos nocturne' } })
  expect((await restarted.read()).state.routine?.enabled).toBe(false)
  expect((await restarted.read()).state.routine?.remindersEnabled).toBe(false)
})
