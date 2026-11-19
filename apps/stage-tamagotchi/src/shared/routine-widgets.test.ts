import { emptyState } from '@proj-airi/stage-ui/libs/routines/model'
import { querySchedule } from '@proj-airi/stage-ui/libs/routines/schedule'
import { expect, it } from 'vitest'

import * as v from 'valibot'

import { projectRoutineWidget, routineWidgetSchema } from './routine-widgets'

const now = Date.parse('2026-10-22T04:00:00Z')
function fixture() {
  const state = emptyState()
  state.routine = {
    id: 'plan',
    title: '日本語',
    subtitle: '',
    timeZone: 'America/Sao_Paulo',
    reviewed: false,
    shortSleepAcknowledged: false,
    enabled: false,
    remindersEnabled: false,
    advanceMinutes: 15,
    pausedUntil: 0,
    activities: [
      { id: 'night', label: '趣味', color: '#12ab34', category: 'other', start: 1410, end: 120, days: [3, 4] },
      { id: 'sleep', label: '睡眠', color: '#abcdef', category: 'sleep', start: 120, end: 480, days: [4] },
    ],
  }
  return state
}
it('projects an empty state without inventing a routine', () => {
  const state = emptyState()
  expect(projectRoutineWidget({ state, schedule: querySchedule(state, now) }, 'day', now)).toMatchObject({ mode: 'day', routine: null, events: [], next: null })
})
it('preserves ids, Japanese labels, colors, overnight carry-in, and the next two occurrences without mutation', () => {
  const state = fixture()
  const before = JSON.stringify(state)
  const value = projectRoutineWidget({ state, schedule: querySchedule(state, now) }, 'next', now)
  expect(value.date).toBe('2026-10-22')
  expect(value.current).toMatchObject({ activityId: 'night', sourceLabel: '趣味', date: '2026-10-21', color: '#12ab34' })
  expect(value.next).toMatchObject({ activityId: 'sleep', category: 'sleep' })
  expect(value.following).toMatchObject({ activityId: 'night', date: '2026-10-22' })
  expect(value.events).toHaveLength(3)
  expect(value.routine?.enabled).toBe(false)
  expect(JSON.stringify(state)).toBe(before)
  expect(v.safeParse(routineWidgetSchema, value).success).toBe(true)
})
it('projects completion and dated overrides without confusing clock progress with completion', () => {
  const state = fixture()
  state.routine!.pausedUntil = now + 3600000
  state.completions.push({ activityId: 'night', date: '2026-10-21', completedAt: now - 1000 })
  state.overrides.push({ activityId: 'sleep', date: '2026-10-22', start: 180, end: 540 })
  const value = projectRoutineWidget({ state, schedule: querySchedule(state, now) }, 'day', now)
  expect(value.events[0].status).toBe('completed')
  expect(value.events[1].modified).toBe(true)
  expect(value.routine?.pausedUntil).toBeGreaterThan(now)
})
it('rejects oversized, hostile and forged widget payloads', () => {
  const state = fixture()
  const value = projectRoutineWidget({ state, schedule: querySchedule(state, now) }, 'day', now)
  expect(v.safeParse(routineWidgetSchema, { ...value, events: Array.from({ length: 121 }).fill(value.events[0]) }).success).toBe(false)
  expect(v.safeParse(routineWidgetSchema, { ...value, routine: { ...value.routine, title: '<img src=x onerror=alert(1)>' } }).success).toBe(false)
  expect(v.safeParse(routineWidgetSchema, { ...value, timeZone: 'Invalid/Zone' }).success).toBe(false)
  expect(v.safeParse(routineWidgetSchema, { ...value, approved: true }).success).toBe(false)
})
