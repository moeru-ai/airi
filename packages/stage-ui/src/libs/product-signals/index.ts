import type { AnalyticsCaptureOptions } from './client'
import type { AnalyticsEvent, InferAnalyticsEventPayload } from './utils/dsl'

import { watch } from 'vue'

import { useBuildInfo } from '../../composables/use-build-info'
import { useAuthStore } from '../../stores/auth'
import { useAiriCardStore } from '../../stores/modules/airi-card'
import { useSettingsAnalytics } from '../../stores/settings/analytics'
import {
  captureAnalyticsEvent,
  configureAnalyticsAdapter,
  disableAnalyticsCapture,
  enableAnalyticsCapture,
  getAnalyticsIdentitySnapshot,
  identifyAnalyticsUser,
  isAnalyticsAvailableInBuild,
  registerAnalyticsBuildInfo,
  resetAnalyticsIdentity,
} from './client'
import { setErrorReportingEnabled, setErrorReportingUser } from './error-reporting'
import {
  analyticsSettingChangedEvent,
  appLoadedEvent,
  characterSwitchedEvent,
  firstMessageSentEvent,
} from './events/app'
import { analyticsSurface } from './surface'

export * from './client'
export * from './error-reporting'
export * from './events'
export * from './privacy-policy'
export * from './surface'
export type { AnalyticsEvent, InferAnalyticsEventPayload } from './utils/dsl'
export { defineEvent } from './utils/dsl'

type AnyAnalyticsEvent = AnalyticsEvent<object>

/** Minimal analytics boundary that product event modules can depend on. */
export interface AnalyticsRecorder {
  /** Emits one typed product event when capture is enabled. */
  emit: <Event extends AnyAnalyticsEvent>(event: Event, payload: InferAnalyticsEventPayload<Event>, options?: AnalyticsCaptureOptions) => boolean
  /** Emits the first-message event once for the current application lifetime. */
  recordFirstMessage: () => boolean
}

/**
 * Owns analytics lifecycle state for one JavaScript runtime.
 *
 * This is not a Pinia store. The module singleton keeps lifecycle state out of
 * product stores while the configured adapter keeps provider SDK calls at the
 * transport boundary.
 */
class Analytics implements AnalyticsRecorder {
  private appStartTime: number | null = null
  private firstMessageRecorded = false
  private initialized = false

  initialize(): void {
    if (this.initialized)
      return

    const buildInfo = useBuildInfo()
    const settingsAnalytics = useSettingsAnalytics()
    const authStore = useAuthStore()
    this.appStartTime = Date.now()
    // Error reports follow the same switch and the same AIRI user as product events.
    setErrorReportingEnabled(settingsAnalytics.analyticsEnabled)

    if (settingsAnalytics.analyticsEnabled && enableAnalytics()) {
      registerAnalyticsBuildInfo(buildInfo)
      this.emit(appLoadedEvent, {
        platform: analyticsSurface(),
        version: buildInfo.version,
      })
    }

    const identify = (userId: string) => {
      identifyAnalyticsUser(userId)
      setErrorReportingUser(userId)
    }
    if (authStore.isAuthenticated && authStore.user?.id)
      identify(authStore.user.id)

    authStore.onAuthenticated(() => {
      if (authStore.user?.id)
        identify(authStore.user.id)
    })
    authStore.onLogout(() => {
      resetAnalyticsIdentity()
      setErrorReportingUser(null)
    })

    watch(() => settingsAnalytics.analyticsEnabled, (enabled, previousEnabled) => {
      setErrorReportingEnabled(enabled)
      if (previousEnabled && !enabled) {
        this.emit(analyticsSettingChangedEvent, {
          setting_name: 'analytics_enabled',
          previous_value: previousEnabled,
          new_value: enabled,
          source: 'settings',
          app_surface: analyticsSurface(),
        })
      }

      if (!enabled) {
        disableAnalytics()
        return
      }

      if (!enableAnalytics())
        return

      if (!previousEnabled) {
        this.emit(analyticsSettingChangedEvent, {
          setting_name: 'analytics_enabled',
          previous_value: previousEnabled,
          new_value: enabled,
          source: 'settings',
          app_surface: analyticsSurface(),
        })
      }

      if (!previousEnabled && !this.firstMessageRecorded) {
        this.appStartTime = null
        this.firstMessageRecorded = true
      }

      registerAnalyticsBuildInfo(buildInfo)
      if (authStore.isAuthenticated && authStore.user?.id)
        identifyAnalyticsUser(authStore.user.id)
    })

    const cardStore = useAiriCardStore()
    watch(() => cardStore.activeCardId, (next, previous) => {
      if (!next || !previous || previous === next)
        return

      this.emit(characterSwitchedEvent, {
        from_character_id: previous,
        to_character_id: next,
      })
    })

    this.initialized = true
  }

  emit<Event extends AnyAnalyticsEvent>(event: Event, payload: InferAnalyticsEventPayload<Event>, options?: AnalyticsCaptureOptions): boolean {
    return captureAnalyticsEvent(event.name, payload, options)
  }

  recordFirstMessage(): boolean {
    if (this.firstMessageRecorded)
      return false

    const timeToFirstMessageMs = this.appStartTime === null
      ? null
      : Date.now() - this.appStartTime
    const captured = this.emit(firstMessageSentEvent, {
      time_to_first_message_ms: timeToFirstMessageMs,
      trigger_method: 'message_send',
      trigger_type: 'user_action',
    })
    if (captured)
      this.firstMessageRecorded = true

    return captured
  }
}

const analytics = new Analytics()

/** Returns the analytics singleton for this JavaScript runtime. */
export function getAnalytics(): AnalyticsRecorder & Pick<Analytics, 'initialize'> {
  return analytics
}

/** Enables capture through the configured analytics provider. */
export function enableAnalytics(): boolean {
  return enableAnalyticsCapture()
}

/** Disables capture through the configured analytics provider. */
export function disableAnalytics(): void {
  disableAnalyticsCapture()
}

/** Starts analytics lifecycle observers after Pinia is available. */
export function initializeAnalytics(): void {
  analytics.initialize()
}

export { configureAnalyticsAdapter, getAnalyticsIdentitySnapshot, isAnalyticsAvailableInBuild }
