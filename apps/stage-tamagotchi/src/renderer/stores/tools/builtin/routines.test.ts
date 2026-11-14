import type { RoutineView } from '@proj-airi/stage-ui/libs/routines/contracts'

import { Buffer } from 'node:buffer'

import { importMaru } from '@proj-airi/stage-ui/libs/routines/maru'
import { emptyState } from '@proj-airi/stage-ui/libs/routines/model'
import { querySchedule } from '@proj-airi/stage-ui/libs/routines/schedule'
import { describe, expect, it, vi } from 'vitest'

import { routineTools } from './routines'

describe('routine conversation capabilities', () => {
  it('exposes read and propose without a commit, import, delete, or activation capability', async () => {
    const propose = vi.fn(async () => ({ id: 'draft', revision: 1, expiresAt: 123, proposedDate: '2026-10-21', change: { kind: 'mute-today' as const } }))
    const tools = await routineTools({
      read: async () => ({
        storageError: null,
        state: { version: 1, revision: 0, routine: null, completions: [], overrides: [], deliveries: [], deliveryWatermark: 0, mutedDate: null },
        schedule: { current: null, next: null, today: [], occurrences: [], date: '' },
        proposals: [],
      }),
      propose,
    })
    expect(tools.map(tool => tool.function.name)).toEqual(['routine_query', 'routine_propose_change'])
    const result = await tools[1].execute({ action: 'mute-today', activityId: null, date: null, startTime: null }, { toolCallId: 'test', messages: [] })
    expect(propose).toHaveBeenCalledExactlyOnceWith({ kind: 'mute-today' })
    expect(String(result)).toContain('pending')
    await expect(tools[1].execute({ action: 'delete', approved: true }, { toolCallId: 'bad', messages: [] })).rejects.toThrow()
    expect(propose).toHaveBeenCalledTimes(1)
  })
})

it.each(['America/Sao_Paulo', 'Asia/Tokyo'])('returns local overnight times without repeating the recurring plan in %s', async (timeZone) => {
  const entries = [
    ['睡眠', 120, 255, 0],
    ['食事', 255, 525, 5],
    ['移動', 525, 555, 11],
    ['仕事', 555, 735, 1],
    ['食事', 735, 780, 5],
    ['仕事', 780, 1110, 1],
    ['食事', 1110, 1155, 5],
    ['仕事', 1155, 1260, 1],
    ['趣味', 1260, 1380, 7],
    ['入浴', 1380, 1410, 2],
    ['趣味', 1410, 120, 7],
  ]
  const code = Buffer.from(JSON.stringify({ v: 1, t: '', s: '', c: 2, e: entries })).toString('base64url')
  const routine = importMaru(`https://kxn4t.github.io/maru-ichinichi/#d=${code}`, timeZone)
  const state = { ...emptyState(), routine }
  const schedule = querySchedule(state, Date.parse(timeZone === 'Asia/Tokyo' ? '2026-10-21T14:40:00Z' : '2026-10-22T02:40:00Z'))
  const view: RoutineView = { state, schedule, proposals: [], storageError: null }
  const tools = await routineTools({ read: async () => view, propose: vi.fn() })
  const result = await tools[0].execute({}, { toolCallId: 'query', messages: [] })
  const value = JSON.parse(String(result))
  expect(value.routine.timeZone).toBe(timeZone)
  expect(value.routine.enabled).toBe(false)
  expect(value.today).toHaveLength(11)
  expect(value.current).toMatchObject({ activityId: routine.activities[10].id, sourceLabel: '趣味', date: '2026-10-21', startTime: '23:30', endDate: '2026-10-22', endTime: '02:00', status: 'planned' })
  expect(value.next).toMatchObject({ activityId: routine.activities[0].id, date: '2026-10-22', startTime: '02:00' })
  expect(value.routine).not.toHaveProperty('activities')
  expect(String(result)).not.toContain('startAt')
  const previous = JSON.stringify({ routine, date: schedule.date, current: schedule.current, next: schedule.next, today: schedule.today, mutedDate: state.mutedDate })
  expect(String(result).length).toBeLessThan(previous.length * 0.7)
})

it('chooses the visual mode in the same trusted query and rejects model-supplied activity data', async () => {
  const state = emptyState()
  const read = vi.fn(async () => ({ state, schedule: querySchedule(state, Date.now()), proposals: [], storageError: null }))
  const tools = await routineTools({ read, propose: vi.fn() })
  await tools[0].execute({ view: 'next' }, { toolCallId: 'next', messages: [] })
  expect(read).toHaveBeenCalledExactlyOnceWith('next')
  await expect(tools[0].execute({ view: 'day', events: [{ label: 'invented' }] }, { toolCallId: 'forged', messages: [] })).rejects.toThrow()
  expect(read).toHaveBeenCalledTimes(1)
})

it('keeps source and display labels separate and does not imply the UI locale is the response language', async () => {
  const code = Buffer.from(JSON.stringify({ v: 1, t: '', s: '', c: 2, e: [['睡眠', 120, 255, 0]] })).toString('base64url')
  const routine = importMaru(`https://kxn4t.github.io/maru-ichinichi/#d=${code}`, 'Asia/Tokyo')
  const state = { ...emptyState(), routine }
  const tools = await routineTools({ read: async () => ({ state, schedule: querySchedule(state, Date.parse('2026-10-21T14:00Z')), proposals: [], storageError: null, locale: 'en' }), propose: vi.fn() })
  const value = JSON.parse(String(await tools[0].execute({ view: 'next' }, { toolCallId: 'localized', messages: [] })))
  expect(value.uiLocale).toBe('en')
  expect(value.next).toMatchObject({ activityId: routine.activities[0].id, sourceLabel: '睡眠', displayLabel: 'Sleep', startTime: '02:00' })
})

// Strict providers such as the OpenAI Responses API reject a function whose `required` omits a declared property.
it('declares every property as required so strict providers accept the routine tools', async () => {
  const tools = await routineTools({ read: vi.fn(), propose: vi.fn() })
  for (const tool of tools) {
    const parameters = tool.function.parameters as { properties: Record<string, unknown>, required: string[] }
    expect([...parameters.required].sort(), tool.function.name).toEqual(Object.keys(parameters.properties).sort())
  }
})

it('treats a null view as the daily agenda', async () => {
  const state = emptyState()
  const read = vi.fn(async (_mode: 'next' | 'day'): Promise<RoutineView> => ({ state, schedule: querySchedule(state, Date.now()), proposals: [], storageError: null }))
  const tools = await routineTools({ read, propose: vi.fn() })
  await tools[0].execute({ view: null }, { toolCallId: 'null-view', messages: [] })
  expect(read).toHaveBeenCalledWith('day')
})
