import type { RoutineState } from './model'
import type { querySchedule } from './schedule'

import * as v from 'valibot'

import { routineSchema } from './model'

const revision = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER))
const minute = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1439))
const date = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/))
const id = v.pipe(v.string(), v.regex(/^[\w-]{1,80}$/))
export const changeSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('postpone'), activityId: id, date, start: minute }),
  v.strictObject({ kind: v.literal('complete'), activityId: id, date }),
  v.strictObject({ kind: v.literal('mute-today') }),
])
export const commandSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('save'), expectedRevision: revision, routine: routineSchema, replace: v.boolean() }),
  v.strictObject({ kind: v.literal('configure'), expectedRevision: revision, reviewed: v.boolean(), shortSleepAcknowledged: v.boolean(), enabled: v.boolean(), remindersEnabled: v.boolean(), advanceMinutes: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(120)) }),
  v.strictObject({ kind: v.literal('pause'), expectedRevision: revision, until: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(8640000000000000)) }),
  v.strictObject({ kind: v.literal('delete'), expectedRevision: revision }),
])

/** Main-owned conversational draft. Its id cannot grant approval through the conversation tool. */
export interface Proposal {
  id: string
  revision: number
  expiresAt: number
  proposedDate: string
  change: v.InferOutput<typeof changeSchema>
}

export type RoutineCommand = v.InferOutput<typeof commandSchema>
export type RoutineChange = v.InferOutput<typeof changeSchema>

/** Snapshot queries never expose paths or provider credentials. */
export interface RoutineView {
  storageError: string | null
  state: RoutineState
  schedule: ReturnType<typeof querySchedule>
  proposals: Proposal[]
}

/** Renderer capability surface. Approval is absent from the conversational tool surface. */
export interface RoutineClient {
  read: () => Promise<RoutineView>
  apply: (command: RoutineCommand) => Promise<RoutineState>
  confirm: (id: string) => Promise<RoutineState>
}
