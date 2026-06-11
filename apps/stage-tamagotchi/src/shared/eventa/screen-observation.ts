import type {
  PauseObservationRequest,
  ScreenObservationSettings,
  ScreenObserverPrivacyState,
  ScreenObserverSummary,
  Task,
  TouchEventPayload,
} from '@proj-airi/server-sdk-shared'

import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

/**
 * Live state of the Electron-main screen observation runtime.
 *
 * This is the desktop runtime's view (collection triggers, OS signals,
 * pause state, the local task registry the decide loop runs against) —
 * model shapes and touch decisions are owned by the server contract in
 * `@proj-airi/server-sdk-shared` and are not duplicated here.
 */
export interface ScreenObservationRuntimeState {
  settings: ScreenObservationSettings
  /** Resolved from settings + pause + OS suppression; single source of truth for tray and renderer badges. */
  privacyState: ScreenObserverPrivacyState
  /** ISO timestamp until which observation is manually paused, if any. */
  pauseUntil?: string
  /** OS-level focus suppression signals (fullscreen apps / active meetings force L0). */
  suppression: {
    isFullscreen: boolean
    isMeeting: boolean
  }
  /** Whether the local screenpipe service responded to the last health check. */
  screenpipeAvailable: boolean
  /** ISO timestamp of the most recent captured summary, if any. */
  latestSummaryAt?: string
  /** Tasks registered with the desktop runtime; the main-process decide loop runs against these. */
  tasks: Task[]
}

export const electronScreenObservationGetState = defineInvokeEventa<ScreenObservationRuntimeState>('eventa:invoke:electron:screen-observation:get-state')
export const electronScreenObservationUpdateSettings = defineInvokeEventa<ScreenObservationRuntimeState, Partial<ScreenObservationSettings>>('eventa:invoke:electron:screen-observation:update-settings')
export const electronScreenObservationPause = defineInvokeEventa<ScreenObservationRuntimeState, PauseObservationRequest>('eventa:invoke:electron:screen-observation:pause')
export const electronScreenObservationResume = defineInvokeEventa<ScreenObservationRuntimeState>('eventa:invoke:electron:screen-observation:resume')
/**
 * Registers (or replaces) a task with the desktop runtime. The renderer's
 * chat confirmation card builds the Task via the shared contract helpers and
 * hands it over here; the main process persists it and decides progress
 * touches against it on each capture tick.
 */
export const electronScreenObservationUpsertTask = defineInvokeEventa<ScreenObservationRuntimeState, { task: Task }>('eventa:invoke:electron:screen-observation:upsert-task')

export const electronScreenObservationStateChanged = defineEventa<ScreenObservationRuntimeState>('eventa:event:electron:screen-observation:state-changed')
export const electronScreenObservationSummaryCaptured = defineEventa<{ summary: ScreenObserverSummary }>('eventa:event:electron:screen-observation:summary-captured')
/** Broadcast for every touch the runtime delivers; renderers drive L1 role gestures and L2 notice content from this. */
export const electronScreenObservationTouchDelivered = defineEventa<TouchEventPayload>('eventa:event:electron:screen-observation:touch-delivered')
/** Emitted when the user clicks an L3 system notification; renderers navigate to the task details view. */
export const electronScreenObservationOpenTaskDetails = defineEventa<{ taskId: string }>('eventa:event:electron:screen-observation:open-task-details')
