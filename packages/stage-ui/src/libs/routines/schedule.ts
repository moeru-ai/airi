import type { RoutineState } from './model'

/** A single dated plan. Completion is an explicit user record, never inferred from the clock. */
export interface Occurrence {
  activityId: string
  date: string
  label: string
  color: string
  startAt: number
  endAt: number
  status: 'planned' | 'completed'
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function parts(epoch: number, zone: string) {
  let formatter = formatters.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    if (formatters.size > 64)
      formatters.clear()
    formatters.set(zone, formatter)
  }
  return Object.fromEntries(formatter.formatToParts(epoch).map(part => [part.type, part.value]))
}

export function localDate(epoch: number, zone: string): string {
  const values = parts(epoch, zone)
  return `${values.year}-${values.month}-${values.day}`
}

export function addDays(date: string, count: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + count * 86400000).toISOString().slice(0, 10)
}

/**
 * Resolves a wall time in the routine's IANA zone. Gaps are skipped and repeated hours use the first instant.
 * Candidate offsets come from both sides of a transition, rather than the host machine timezone.
 */
export function wallTime(date: string, minute: number, zone: string): number | undefined {
  const nominal = Date.parse(`${date}T00:00:00Z`) + minute * 60000
  const offsets = new Set<number>()
  for (let hour = -36; hour <= 36; hour += 6) {
    const probe = nominal + hour * 3600000
    const values = parts(probe, zone)
    const localEpoch = Date.parse(`${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:00Z`)
    offsets.add(localEpoch - probe)
  }
  const matches = [...offsets].map(offset => nominal - offset).filter((candidate) => {
    const values = parts(candidate, zone)
    return localDate(candidate, zone) === date && Number(values.hour) * 60 + Number(values.minute) === minute
  })
  return matches.length ? Math.min(...matches) : undefined
}

/** Queries include yesterday's overnight plan and a full week ahead. Disabled routines remain visible as plans. */
export function querySchedule(state: RoutineState, now: number) {
  const routine = state.routine
  const all: Occurrence[] = []
  if (!routine)
    return { current: null, next: null, today: all, occurrences: all, date: '' }
  const today = localDate(now, routine.timeZone)
  for (let offset = -1; offset <= 8; offset++) {
    const date = addDays(today, offset)
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    for (const activity of routine.activities) {
      if (!activity.days.includes(weekday))
        continue
      const override = state.overrides.find(item => item.date === date && item.activityId === activity.id)
      const { start, end } = override ?? activity
      const startAt = wallTime(date, start, routine.timeZone)
      const endAt = wallTime(end < start ? addDays(date, 1) : date, end, routine.timeZone)
      if (startAt === undefined || endAt === undefined || endAt <= startAt)
        continue
      all.push({
        activityId: activity.id,
        date,
        label: activity.label,
        color: activity.color,
        startAt,
        endAt,
        status: state.completions.some(item => item.date === date && item.activityId === activity.id) ? 'completed' : 'planned',
      })
    }
  }
  all.sort((a, b) => a.startAt - b.startAt)
  return {
    current: all.find(item => item.startAt <= now && item.endAt > now) ?? null,
    next: all.find(item => item.startAt > now && item.status === 'planned') ?? null,
    today: all.filter(item => item.date === today),
    occurrences: all,
    date: today,
  }
}

/** Dated overrides must preserve the same no-overlap invariant as recurring activities. */
export function occurrencesOverlap(state: RoutineState, now: number): boolean {
  const items = querySchedule(state, now).occurrences
  return items.some((item, index) => index > 0 && item.startAt < items[index - 1].endAt)
}
