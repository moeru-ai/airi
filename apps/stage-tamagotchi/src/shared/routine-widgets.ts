import type { RoutineView } from '@proj-airi/stage-ui/libs/routines/contracts'
import type { Occurrence } from '@proj-airi/stage-ui/libs/routines/schedule'

import { colorSchema, displayLabelsSchema, displayText, timeZoneSchema } from '@proj-airi/stage-ui/libs/routines/model'
import { localDate } from '@proj-airi/stage-ui/libs/routines/schedule'

import * as v from 'valibot'

export const routineWidgetModeSchema = v.picklist(['next', 'day'])
export type RoutineWidgetMode = v.InferOutput<typeof routineWidgetModeSchema>
const timestamp = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(8640000000000000))
const date = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/))
const eventSchema = v.pipe(v.strictObject({
  activityId: v.pipe(v.string(), v.regex(/^[\w-]{1,80}$/)),
  date,
  sourceLabel: displayText,
  displayLabels: v.optional(displayLabelsSchema),
  color: colorSchema,
  category: v.picklist(['sleep', 'other']),
  startAt: timestamp,
  endAt: timestamp,
  status: v.picklist(['planned', 'completed']),
  modified: v.boolean(),
}), v.check(item => item.endAt > item.startAt))
export type RoutineWidgetEvent = v.InferOutput<typeof eventSchema>
export const routineWidgetSchema = v.strictObject({
  mode: routineWidgetModeSchema,
  date: v.union([date, v.literal('')]),
  timeZone: timeZoneSchema,
  generatedAt: timestamp,
  routine: v.nullable(v.strictObject({
    title: displayText,
    enabled: v.boolean(),
    pausedUntil: timestamp,
  })),
  current: v.nullable(eventSchema),
  next: v.nullable(eventSchema),
  following: v.nullable(eventSchema),
  events: v.pipe(v.array(eventSchema), v.maxLength(120)),
})
export type RoutineWidgetData = v.InferOutput<typeof routineWidgetSchema>

/** Only the profile-owned main process constructs these props. They never enter the model response. */
export function projectRoutineWidget(view: Pick<RoutineView, 'state' | 'schedule'>, mode: RoutineWidgetMode, now: number): RoutineWidgetData {
  const { state, schedule } = view
  const routine = state.routine
  const timeZone = routine?.timeZone ?? 'UTC'
  function event(item: Occurrence | null): RoutineWidgetEvent | null {
    if (!item)
      return null
    const activity = routine?.activities.find(activity => activity.id === item.activityId)
    if (!activity)
      throw new Error('unknown-routine-activity')
    const { label: sourceLabel, ...occurrence } = item
    return { ...occurrence, sourceLabel, displayLabels: activity.displayLabels, category: activity.category, modified: state.overrides.some(override => override.activityId === item.activityId && override.date === item.date) }
  }
  const future = schedule.occurrences.filter(item => item.startAt > now && item.status !== 'completed')
  return v.parse(routineWidgetSchema, {
    mode,
    date: schedule.date,
    timeZone,
    generatedAt: now,
    routine: routine ? { title: routine.title, enabled: routine.enabled, pausedUntil: routine.pausedUntil } : null,
    current: event(schedule.current),
    next: event(schedule.next),
    following: event(future[1] ?? null),
    events: schedule.occurrences.filter(item => item.date === schedule.date || (item.date < schedule.date && localDate(item.endAt - 1, timeZone) >= schedule.date)).map(event),
  })
}

/** Reserved at the generic widget IPC boundary; only the routine service may present profile data. */
export function isReservedRoutineWidget(id?: string, componentName?: string): boolean {
  return Boolean(id?.trim().toLowerCase().startsWith('routine:') || ['routine-next', 'routine-agenda'].includes(componentName?.trim().toLowerCase() ?? ''))
}
