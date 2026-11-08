import type { WidgetsAddPayload, WidgetSnapshot, WidgetsUpdatePayload } from '../../../shared/eventa'

import { Buffer } from 'node:buffer'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import messages from '@proj-airi/i18n/locales'

import { createContext, defineInvoke } from '@moeru/eventa'
import { importMaru } from '@proj-airi/stage-ui/libs/routines/maru'
import { afterEach, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

import { routinesApply, routinesConfirm, routinesPropose, routinesQuery, routinesRead } from '../../../shared/eventa/routines'
import { setupRoutines } from './index'

const host = vi.hoisted(() => ({
  root: '',
  locale: 'en',
  supported: true,
  show: vi.fn(),
  created: vi.fn(),
  approve: vi.fn(async (_options: { detail?: string }) => ({ response: 1 })),
  resume: new Set<() => void>(),
  shutdown: [] as Array<() => Promise<void>>,
}))
vi.mock('electron', () => ({
  app: { getPath: () => host.root },
  dialog: { showMessageBox: host.approve },
  Notification: class {
    static isSupported() { return host.supported }
    constructor(options: unknown) { host.created(options) }
    show() { host.show() }
  },
  powerMonitor: {
    on: (_event: string, callback: () => void) => host.resume.add(callback),
    removeListener: (_event: string, callback: () => void) => host.resume.delete(callback),
  },
}))
vi.mock('../../libs/bootkit/lifecycle', () => ({
  onAppBeforeQuit: (callback: () => Promise<void>) => host.shutdown.push(callback),
}))
afterEach(async () => {
  for (const callback of host.shutdown.splice(0)) await callback()
  host.resume.clear()
  host.supported = true
  host.locale = 'en'
  host.approve.mockResolvedValue({ response: 1 })
  vi.clearAllMocks()
  vi.useRealTimers()
})
async function setup() {
  host.root = await mkdtemp(join(tmpdir(), 'airi-maru-ipc-'))
  const context = createContext()
  const snapshots = new Map<string, WidgetSnapshot>()
  const manager = {
    pushWidget: vi.fn(async (payload: WidgetsAddPayload) => {
      const id = payload.id!
      snapshots.set(id, { id, componentName: payload.componentName, componentProps: payload.componentProps ?? {}, alwaysOnTop: payload.alwaysOnTop ?? false, ttlMs: payload.ttlMs ?? 0, size: payload.size ?? 'm' })
      return id
    }),
    updateWidget: vi.fn(async (payload: WidgetsUpdatePayload) => {
      const previous = snapshots.get(payload.id)!
      snapshots.set(payload.id, { ...previous, ...payload, componentProps: payload.componentProps ?? previous.componentProps })
    }),
    getWidgetSnapshot: (id: string) => snapshots.get(id),
  }
  const translated = createI18n({ legacy: false, locale: host.locale, messages })
  setupRoutines(context, key => translated.global.t(key), manager, () => host.locale)
  const query = defineInvoke(context, routinesQuery)
  const read = defineInvoke(context, routinesRead)
  const apply = defineInvoke(context, routinesApply)
  const propose = defineInvoke(context, routinesPropose)
  const confirm = defineInvoke(context, routinesConfirm)
  const code = Buffer.from(JSON.stringify({ v: 1, t: 'day', s: '', c: 2, e: [['study', 1200, 1260, 1]] })).toString('base64url')
  const routine = importMaru(`https://kxn4t.github.io/maru-ichinichi/#d=${code}`, 'America/Sao_Paulo')
  await read()
  return { read, apply, propose, confirm, routine, query, manager, snapshots }
}

it('gates writes through native confirmation and never allows a proposal to approve itself', async () => {
  const { apply, read, routine, propose, confirm } = await setup()
  await expect(apply({ kind: 'save', expectedRevision: 0, routine, replace: false })).rejects.toThrow('user-cancelled')
  expect((await read()).state.routine).toBeNull()
  host.approve.mockResolvedValue({ response: 0 })
  await apply({ kind: 'save', expectedRevision: 0, routine, replace: false })
  const callsBeforeProposal = host.approve.mock.calls.length
  const proposal = await propose({ kind: 'mute-today' })
  expect(host.approve).toHaveBeenCalledTimes(callsBeforeProposal)
  expect((await read()).state.mutedDate).toBeNull()
  host.approve.mockResolvedValue({ response: 1 })
  await expect(confirm({ id: proposal.id })).rejects.toThrow('user-cancelled')
  expect((await read()).state.mutedDate).toBeNull()
  expect(host.show).not.toHaveBeenCalled()
})

it('uses the routine time zone, deduplicates resume ticks, and cleans up on shutdown', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(Date.parse('2026-10-21T22:45:10Z'))
  const { apply, routine } = await setup()
  host.approve.mockResolvedValue({ response: 0 })
  await apply({ kind: 'save', expectedRevision: 0, routine, replace: false })
  expect(host.show).not.toHaveBeenCalled()
  await apply({ kind: 'configure', expectedRevision: 1, reviewed: true, shortSleepAcknowledged: true, enabled: true, remindersEnabled: true, advanceMinutes: 15 })
  await vi.waitFor(() => expect(host.show).toHaveBeenCalledTimes(1))
  expect(host.created.mock.calls[0][0]).toMatchObject({ title: 'study', body: expect.stringContaining('20:00') })
  for (const resume of host.resume) resume()
  await vi.advanceTimersByTimeAsync(30000)
  expect(host.show).toHaveBeenCalledTimes(1)
  for (const callback of host.shutdown.splice(0)) await callback()
  expect(host.resume.size).toBe(0)
  await vi.advanceTimersByTimeAsync(60000)
  expect(host.show).toHaveBeenCalledTimes(1)
})

it('shows the effective prior time when postponing the same occurrence twice', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(Date.parse('2026-10-21T13:00:00Z'))
  const { apply, routine, propose, confirm } = await setup()
  host.approve.mockResolvedValue({ response: 0 })
  await apply({ kind: 'save', expectedRevision: 0, routine, replace: false })
  const activityId = routine.activities[0].id
  const first = await propose({ kind: 'postpone', activityId, date: '2026-10-21', start: 1260 })
  await confirm({ id: first.id })
  const second = await propose({ kind: 'postpone', activityId, date: '2026-10-21', start: 1320 })
  await confirm({ id: second.id })
  expect(host.approve.mock.calls.at(-1)?.[0].detail).toContain('21:00 → 22:00')
})

it('opens trusted next/day cards, serializes concurrent updates and never writes the saved routine', async () => {
  const { read, apply, routine, query, manager, snapshots } = await setup()
  const empty = await query({ view: 'day' })
  expect(empty.state.routine).toBeNull()
  expect(snapshots.get('routine:day')?.componentProps.data.routine).toBeNull()
  host.approve.mockResolvedValue({ response: 0 })
  await apply({ kind: 'save', expectedRevision: 0, routine, replace: false })
  const before = JSON.stringify((await read()).state)
  await Promise.all([query({ view: 'next' }), query({ view: 'next' }), query({ view: 'day' })])
  expect(manager.pushWidget).toHaveBeenCalledTimes(2)
  expect(manager.updateWidget).toHaveBeenCalledTimes(3)
  expect(snapshots.get('routine:next')).toMatchObject({ componentName: 'routine-next', ttlMs: 60000, alwaysOnTop: false })
  expect(snapshots.get('routine:day')).toMatchObject({ componentName: 'routine-agenda', ttlMs: 120000, alwaysOnTop: false })
  expect(JSON.stringify((await read()).state)).toBe(before)
  expect(host.approve).toHaveBeenCalledTimes(1)
  await expect(query({ view: 'delete' } as never)).rejects.toThrow()
  await expect(query({ view: 'day', activities: [] } as never)).rejects.toThrow()
})

it('preserves the text query after a window failure, and recovers on the next query', async () => {
  const { query, manager } = await setup()
  manager.pushWidget.mockRejectedValueOnce(new Error('window-failed'))
  const result = await query({ view: 'day' })
  expect(result.state.routine).toBeNull()
  expect(result.visualStatus).toBe('unavailable')
  expect((await query({ view: 'day' })).visualStatus).toBe('shown')
})

it('refuses a colliding non-routine widget without updating or closing another component', async () => {
  const { query, manager, snapshots } = await setup()
  const collision: WidgetSnapshot = { id: 'routine:next', componentName: 'extension-ui', componentProps: { existing: true }, ttlMs: 0, alwaysOnTop: false, size: 'm' }
  snapshots.set(collision.id, collision)
  expect((await query({ view: 'next' })).visualStatus).toBe('unavailable')
  expect(snapshots.get(collision.id)).toEqual(collision)
  expect(manager.pushWidget).not.toHaveBeenCalled()
  expect(manager.updateWidget).not.toHaveBeenCalled()
})

it('exposes the selected UI locale in the trusted query and confirms custom labels before persisting', async () => {
  host.locale = 'fr'
  host.approve.mockResolvedValue({ response: 1 })
  const { apply, read, routine, query } = await setup()
  routine.activities[0].displayLabels = { fr: 'Étude' }
  await expect(apply({ kind: 'save', expectedRevision: 0, routine, replace: false })).rejects.toThrow('user-cancelled')
  expect((await read()).state.routine).toBeNull()
  host.approve.mockResolvedValue({ response: 0 })
  await apply({ kind: 'save', expectedRevision: 0, routine, replace: false })
  expect(host.approve.mock.calls.at(-1)?.[0].detail).toContain('Étude')
  expect((await query({ view: 'day' })).locale).toBe('fr')
  expect((await read()).state.routine?.activities[0]).toMatchObject({ label: 'study', displayLabels: { fr: 'Étude' } })
  host.locale = 'en'
})

it('updates an already open card only after a human-approved state change, without spawning another window or renewing TTL', async () => {
  const { query, apply, read, routine, manager, snapshots } = await setup()
  host.approve.mockResolvedValue({ response: 0 })
  await apply({ kind: 'save', expectedRevision: 0, routine, replace: false })
  await query({ view: 'day' })
  const before = structuredClone(snapshots.get('routine:day'))
  const until = Date.now() + 3600000
  host.approve.mockResolvedValue({ response: 1 })
  await expect(apply({ kind: 'pause', expectedRevision: 1, until })).rejects.toThrow('user-cancelled')
  expect(snapshots.get('routine:day')).toEqual(before)
  host.approve.mockResolvedValue({ response: 0 })
  await apply({ kind: 'pause', expectedRevision: 1, until })
  expect(snapshots.get('routine:day')?.componentProps.data.routine.pausedUntil).toBe(until)
  expect(manager.pushWidget).toHaveBeenCalledTimes(1)
  expect(manager.updateWidget.mock.calls.at(-1)?.[0].ttlMs).toBeUndefined()
  expect((await read()).state.revision).toBe(2)
})

it('localizes a scheduled notification title from its approved display name', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(Date.parse('2026-10-21T22:45:10Z'))
  host.locale = 'fr'
  const { apply, routine } = await setup()
  routine.activities[0].label = '睡眠'
  routine.activities[0].category = 'sleep'
  routine.activities[0].displayLabels = { fr: 'Repos approuvé' }
  host.approve.mockResolvedValue({ response: 0 })
  await apply({ kind: 'save', expectedRevision: 0, routine, replace: false })
  await apply({ kind: 'configure', expectedRevision: 1, reviewed: true, shortSleepAcknowledged: true, enabled: true, remindersEnabled: true, advanceMinutes: 15 })
  await vi.waitFor(() => expect(host.show).toHaveBeenCalledTimes(1))
  expect(host.created.mock.calls[0][0]).toMatchObject({ title: 'Repos approuvé', body: expect.stringContaining('20:00') })
})
