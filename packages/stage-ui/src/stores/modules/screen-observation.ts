import type {
  DailySummaryPayload,
  ScreenObservationSnapshot,
  ScreenObserverPrivacyState,
  ScreenObserverSummary,
  Task,
  TouchEventPayload,
  TouchLevel,
} from '@proj-airi/server-sdk-shared'

import { DEFAULT_DAILY_SUMMARY_LOCAL_TIME, DEFAULT_TOUCH_LEVEL } from '@proj-airi/server-sdk-shared'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/** Inputs for the renderer-side provisional privacy-state fallback. */
export interface ProvisionalPrivacyStateInput {
  enabled: boolean
  allowedApps: readonly string[]
  pauseUntil?: string
  now: Date
}

/**
 * Derives a provisional privacy state for display before the desktop
 * runtime has pushed an authoritative snapshot.
 *
 * Use when:
 * - Rendering observation status (settings, dashboard, tray-adjacent UI)
 *   while no `ScreenObservationSnapshot` has arrived yet.
 *
 * Expects:
 * - Renderer-persisted settings only; fullscreen/meeting suppression is an
 *   OS signal the renderer cannot see, so it is never produced here.
 *
 * Returns:
 * - The same precedence the server domain applies for the states the
 *   renderer can know: disabled > empty whitelist (the explicit
 *   "not observing" dead-state) > paused-until-future > observing.
 */
export function provisionalPrivacyState(input: ProvisionalPrivacyStateInput): ScreenObserverPrivacyState {
  if (!input.enabled)
    return 'disabled'
  if (input.allowedApps.length === 0)
    return 'not_observing_empty_whitelist'
  if (input.pauseUntil && new Date(input.pauseUntil).getTime() > input.now.getTime())
    return 'paused'
  return 'observing'
}

/**
 * Maps a privacy state to its i18n key under
 * `settings.pages.modules.screen-observation.status.*`.
 *
 * Use when:
 * - Any surface needs the localized status sentence; keeping the mapping
 *   here guarantees every surface shows the same wording, including the
 *   mandated "no app selected, currently not observing" dead-state copy.
 *
 * Returns:
 * - A full i18n key string, never a raw enum value.
 */
export function privacyStateLabelKey(state: ScreenObserverPrivacyState): string {
  return `settings.pages.modules.screen-observation.status.${state.replaceAll('_', '-')}`
}

export const useScreenObservationStore = defineStore('screen-observation', () => {
  // Privacy-first defaults frozen in the product decision (issue AIR-5):
  // master switch off, whitelist empty, daily summary on at 18:00, L1 touch.
  const enabled = useLocalStorageManualReset<boolean>('settings/screen-observation/enabled', false)
  const allowedApps = useLocalStorageManualReset<string[]>('settings/screen-observation/allowed-apps', [])
  const dailySummaryEnabled = useLocalStorageManualReset<boolean>('settings/screen-observation/daily-summary-enabled', true)
  const dailySummaryAtLocalTime = useLocalStorageManualReset<string>('settings/screen-observation/daily-summary-at', DEFAULT_DAILY_SUMMARY_LOCAL_TIME)
  const defaultTouchLevel = useLocalStorageManualReset<TouchLevel>('settings/screen-observation/default-touch-level', DEFAULT_TOUCH_LEVEL)
  const autoPauseOnFocus = useLocalStorageManualReset<boolean>('settings/screen-observation/auto-pause-on-focus', true)
  const onboardingCompleted = useLocalStorageManualReset<boolean>('settings/screen-observation/onboarding-completed', false)

  // Runtime state. Hydrated by applySnapshot once the desktop runtime
  // (Electron main process ScreenObserver) pushes the authoritative
  // ScreenObservationSnapshot over Eventa; provisional before that.
  const tasks = ref<Task[]>([])
  const observationLog = ref<ScreenObserverSummary[]>([])
  const latestTouches = ref<TouchEventPayload[]>([])
  const latestDailySummary = ref<DailySummaryPayload>()
  const pauseUntil = ref<string>()
  const snapshotPrivacyState = ref<ScreenObserverPrivacyState>()

  const privacyState = computed<ScreenObserverPrivacyState>(() =>
    snapshotPrivacyState.value ?? provisionalPrivacyState({
      enabled: enabled.value,
      allowedApps: allowedApps.value,
      pauseUntil: pauseUntil.value,
      now: new Date(),
    }))

  const isEffectivelyObserving = computed(() => privacyState.value === 'observing')
  const statusLabelKey = computed(() => privacyStateLabelKey(privacyState.value))

  const activeTasks = computed(() => tasks.value.filter(task => task.status === 'active' || task.status === 'paused'))

  function applySnapshot(snapshot: ScreenObservationSnapshot) {
    enabled.value = snapshot.settings.enabled
    allowedApps.value = [...snapshot.settings.allowedApps]
    dailySummaryEnabled.value = snapshot.settings.dailySummaryEnabled
    dailySummaryAtLocalTime.value = snapshot.settings.dailySummaryAtLocalTime
    tasks.value = snapshot.tasks
    observationLog.value = snapshot.latestSummaries
    latestTouches.value = snapshot.latestTouches
    snapshotPrivacyState.value = snapshot.privacyState
  }

  function resetState() {
    enabled.reset()
    allowedApps.reset()
    dailySummaryEnabled.reset()
    dailySummaryAtLocalTime.reset()
    defaultTouchLevel.reset()
    autoPauseOnFocus.reset()
    onboardingCompleted.reset()
    tasks.value = []
    observationLog.value = []
    latestTouches.value = []
    latestDailySummary.value = undefined
    pauseUntil.value = undefined
    snapshotPrivacyState.value = undefined
  }

  return {
    enabled,
    allowedApps,
    dailySummaryEnabled,
    dailySummaryAtLocalTime,
    defaultTouchLevel,
    autoPauseOnFocus,
    onboardingCompleted,
    tasks,
    activeTasks,
    observationLog,
    latestTouches,
    latestDailySummary,
    pauseUntil,
    privacyState,
    isEffectivelyObserving,
    statusLabelKey,
    applySnapshot,
    resetState,
  }
})
