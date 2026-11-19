import type { InferOutput } from 'valibot'

import * as v from 'valibot'

const minute = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1439))
const identifier = v.pipe(v.string(), v.regex(/^[\w-]{1,80}$/))
const dateKey = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/), v.check(value => new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value))
const timestamp = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(8640000000000000))

/** Text remains display data. Markup, controls, and directional overrides are rejected. */
export const displayText = v.pipe(v.string(), v.maxLength(160), v.regex(/^[^<>\p{Cc}\u202A-\u202E\u2066-\u2069]*$/u))
export const colorSchema = v.pipe(v.string(), v.regex(/^#[\da-f]{6}$/i))
export const timeZoneSchema = v.pipe(v.string(), v.maxLength(80), v.check((zone) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone }).format(0)
    return true
  }
  catch {
    return false
  }
}))

const translatedLabel = v.pipe(displayText, v.minLength(1), v.check(label => label.trim().length > 0))
/** Optional human-approved display names. Absence uses a recognized translation or the unchanged original. */
export const displayLabelsSchema = v.strictObject({
  'en': v.optional(translatedLabel),
  'es': v.optional(translatedLabel),
  'fr': v.optional(translatedLabel),
  'ja': v.optional(translatedLabel),
  'ko': v.optional(translatedLabel),
  'pt-BR': v.optional(translatedLabel),
  'ru': v.optional(translatedLabel),
  'vi': v.optional(translatedLabel),
  'zh-Hans': v.optional(translatedLabel),
  'zh-Hant': v.optional(translatedLabel),
})
export type DisplayLabels = InferOutput<typeof displayLabelsSchema>
export type RoutineLocale = keyof DisplayLabels

export const activitySchema = v.pipe(v.strictObject({
  id: identifier,
  label: v.pipe(displayText, v.minLength(1), v.check(label => label.trim().length > 0)),
  category: v.picklist(['sleep', 'other']),
  displayLabels: v.optional(displayLabelsSchema),
  start: minute,
  end: minute,
  color: colorSchema,
  days: v.pipe(v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6))), v.minLength(1), v.maxLength(7), v.check(days => new Set(days).size === days.length)),
}), v.check(activity => activity.start !== activity.end, 'ambiguous-duration'))

/** Weekdays own the start date. An overnight activity continues into the next weekday. */
export type Activity = InferOutput<typeof activitySchema>

/** Rejects overlaps across both day and week boundaries. Adjacent intervals are valid. */
export function hasOverlap(activities: Activity[]): boolean {
  const occupied = new Uint8Array(7 * 1440)
  for (const activity of activities) {
    const duration = (activity.end - activity.start + 1440) % 1440
    for (const day of activity.days) {
      for (let offset = 0; offset < duration; offset++) {
        const minute = (day * 1440 + activity.start + offset) % occupied.length
        if (occupied[minute])
          return true
        occupied[minute] = 1
      }
    }
  }
  return false
}

export const routineSchema = v.pipe(v.strictObject({
  id: identifier,
  title: displayText,
  subtitle: displayText,
  timeZone: timeZoneSchema,
  activities: v.pipe(v.array(activitySchema), v.minLength(1), v.maxLength(60), v.check(items => new Set(items.map(item => item.id)).size === items.length)),
  reviewed: v.boolean(),
  shortSleepAcknowledged: v.boolean(),
  enabled: v.boolean(),
  remindersEnabled: v.boolean(),
  advanceMinutes: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(120)),
  pausedUntil: timestamp,
}), v.check(routine => !hasOverlap(routine.activities), 'overlap'), v.check(routine => !routine.enabled || routine.reviewed, 'review-required'), v.check(routine => !routine.remindersEnabled || routine.enabled, 'activation-required'), v.check(routine => !routine.enabled || !shortSleepDays(routine.activities).length || routine.shortSleepAcknowledged, 'sleep-review-required'))

/** Persisted routine configuration. Scheduling never changes the planned activity into a completion. */
export type Routine = InferOutput<typeof routineSchema>

/** Totals sleep by the weekday that owns each activity start. */
export function sleepMinutesByDay(activities: Activity[]): number[] {
  const totals = [0, 0, 0, 0, 0, 0, 0]
  for (const activity of activities.filter(activity => activity.category === 'sleep')) {
    for (const day of activity.days)
      totals[day] += (activity.end - activity.start + 1440) % 1440
  }
  return totals
}

/** Flags selected start days with less than six hours of categorized sleep. */
export function shortSleepDays(activities: Activity[]): number[] {
  const totals = sleepMinutesByDay(activities)
  const scheduled = new Set(activities.flatMap(activity => activity.days))
  return [...scheduled].filter(day => totals[day] < 360)
}

export const stateSchema = v.strictObject({
  version: v.literal(1),
  revision: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER)),
  routine: v.nullable(routineSchema),
  completions: v.pipe(v.array(v.strictObject({ activityId: identifier, date: dateKey, completedAt: timestamp })), v.maxLength(4096)),
  overrides: v.pipe(v.array(v.pipe(v.strictObject({ activityId: identifier, date: dateKey, start: minute, end: minute }), v.check(item => item.start !== item.end, 'ambiguous-duration'))), v.maxLength(4096)),
  mutedDate: v.nullable(dateKey),
  deliveryWatermark: timestamp,
  deliveries: v.pipe(v.array(v.pipe(v.string(), v.maxLength(256))), v.maxLength(4096)),
})

/** Only the main process writes this versioned, profile-local snapshot. */
export type RoutineState = InferOutput<typeof stateSchema>

export function emptyState(): RoutineState {
  return { version: 1, revision: 0, routine: null, completions: [], overrides: [], mutedDate: null, deliveryWatermark: 0, deliveries: [] }
}
