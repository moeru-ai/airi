import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { importMaru } from './maru'
import { emptyState } from './model'
import { localDate, querySchedule, wallTime } from './schedule'

function state(entries: unknown[], zone = 'America/Sao_Paulo') {
  const result = emptyState()
  const code = Buffer.from(JSON.stringify({ v: 1, t: '', s: '', c: 0, e: entries })).toString('base64url')
  result.routine = importMaru(`https://kxn4t.github.io/maru-ichinichi/#d=${code}`, zone)
  return result
}

describe('routine calendar', () => {
  it('finds the previous day overnight activity and next activity in the routine zone', () => {
    const data = state([['趣味', 1410, 120, 7], ['睡眠', 120, 255, 0]])
    const view = querySchedule(data, Date.parse('2026-10-21T04:00:00Z'))
    expect(view.current?.date).toBe('2026-10-20')
    expect(view.current?.label).toBe('趣味')
    expect(view.next?.label).toBe('睡眠')
    expect(view.next?.startAt).toBe(Date.parse('2026-10-21T05:00:00Z'))
    expect(view.current?.status).toBe('planned')
  })

  it('honors weekday ownership across the Saturday/Sunday boundary', () => {
    const data = state([['x', 1410, 120, 0]])
    data.routine!.activities[0].days = [6]
    const view = querySchedule(data, Date.parse('2026-10-25T04:00:00Z'))
    expect(view.current?.date).toBe('2026-10-24')
    expect(view.today).toHaveLength(0)
  })

  it('keeps completions separate and applies an override to one date only', () => {
    const data = state([['study', 600, 660, 1]])
    const id = data.routine!.activities[0].id
    data.overrides.push({ activityId: id, date: '2026-10-21', start: 1200, end: 1260 })
    data.completions.push({ activityId: id, date: '2026-10-21', completedAt: Date.parse('2026-10-21T23:01:00Z') })
    const view = querySchedule(data, Date.parse('2026-10-21T23:30:00Z'))
    expect(view.current?.status).toBe('completed')
    expect(data.routine!.activities[0].start).toBe(600)
    expect(view.next?.startAt).toBe(Date.parse('2026-10-22T13:00:00Z'))
  })

  it('skips DST gaps and chooses the first instant in a repeated hour', () => {
    expect(wallTime('2026-03-08', 150, 'America/New_York')).toBeUndefined()
    expect(wallTime('2026-11-01', 90, 'America/New_York')).toBe(Date.parse('2026-11-01T05:30:00Z'))
    expect(localDate(Date.parse('2026-10-21T02:00:00Z'), 'America/Sao_Paulo')).toBe('2026-10-20')
  })
})
