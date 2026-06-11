import type {
  CreateTaskInput as SharedCreateTaskInput,
  DecideTouchInput as SharedDecideTouchInput,
  Task,
  TouchEventPayload,
} from '@proj-airi/server-sdk-shared'

import {
  createScreenObservationTask as createSharedScreenObservationTask,
  decideScreenObservationTouch as decideSharedScreenObservationTouch,
} from '@proj-airi/server-sdk-shared'

import { nanoid } from '../../utils/id'

export type {
  DailySummaryDecision,
  NormalizeSummaryInput,
  ObservationStateInput,
} from '@proj-airi/server-sdk-shared'
export type CreateTaskInput = Omit<SharedCreateTaskInput, 'id'> & { id?: string }
export type DecideTouchInput = Omit<SharedDecideTouchInput, 'id'> & { id?: string }

export {
  decideDailySummary,
  normalizeScreenObserverSummary,
  resolveObservationPrivacyState,
} from '@proj-airi/server-sdk-shared'

/**
 * Builds a normalized task model and supplies the server-owned id.
 * Core task defaults live in `@proj-airi/server-sdk-shared`.
 */
export function createScreenObservationTask(input: CreateTaskInput, now = new Date()): Task {
  return createSharedScreenObservationTask({
    ...input,
    id: input.id ?? nanoid(),
  }, now)
}

/**
 * Applies the shared L0-L3 touch policy and supplies the server-owned event id.
 * Core touch decisions live in `@proj-airi/server-sdk-shared`.
 */
export function decideScreenObservationTouch(input: DecideTouchInput): TouchEventPayload {
  return decideSharedScreenObservationTouch({
    ...input,
    id: input.id ?? nanoid(),
  })
}
