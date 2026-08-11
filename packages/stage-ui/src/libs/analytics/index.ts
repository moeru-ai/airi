import type { AnalyticsCaptureOptions } from './client'
import type { AnalyticsEvent, InferAnalyticsEventPayload } from './utils/dsl'

import { isStageCapacitor, isStageTamagotchi } from '@proj-airi/stage-shared'
import { watch } from 'vue'

import { useBuildInfo } from '../../composables/use-build-info'
import { useAuthStore } from '../../stores/auth'
import { useAiriCardStore } from '../../stores/modules/airi-card'
import { useConsciousnessStore } from '../../stores/modules/consciousness'
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
import {
  analyticsSettingChangedEvent,
  appLoadedEvent,
  characterSwitchedEvent,
  firstMessageSentEvent,
  firstModelSelectedEvent,
  modelChangedEvent,
  modelSwitchedEvent,
  providerSwitchedEvent,
} from './events/app'
import { getProviderMode } from './events/chat/types'

export * from './client'
export * from './events'
export * from './privacy-policy'
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

function analyticsSurface(): 'web' | 'desktop' | 'mobile' {
  return isStageTamagotchi()
    ? 'desktop'
    : isStageCapacitor()
      ? 'mobile'
      : 'web'
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
  private firstModelSelectedRecorded = false
  private initialized = false

  initialize(): void {
    if (this.initialized)
      return

    const buildInfo = useBuildInfo()
    const settingsAnalytics = useSettingsAnalytics()
    const authStore = useAuthStore()
    this.appStartTime = Date.now()

    if (settingsAnalytics.analyticsEnabled && enableAnalytics()) {
      registerAnalyticsBuildInfo(buildInfo)
      this.emit(appLoadedEvent, {
        platform: analyticsSurface(),
        version: buildInfo.version,
      })
    }

    if (authStore.isAuthenticated && authStore.user?.id)
      identifyAnalyticsUser(authStore.user.id)

    authStore.onAuthenticated(() => {
      if (authStore.user?.id)
        identifyAnalyticsUser(authStore.user.id)
    })
    authStore.onLogout(() => {
      resetAnalyticsIdentity()
    })

    watch(() => settingsAnalytics.analyticsEnabled, (enabled, previousEnabled) => {
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

    const consciousness = useConsciousnessStore()
    watch(
      () => ({ provider: consciousness.activeProvider, model: consciousness.activeModel }),
      (next, previous) => {
        if (!next.provider || !next.model)
          return

        if (!previous) {
          if (!this.firstModelSelectedRecorded && this.emit(firstModelSelectedEvent, { model_id: next.model, provider: next.provider }))
            this.firstModelSelectedRecorded = true
          return
        }

        if (previous.provider === next.provider && previous.model === next.model)
          return

        if (!this.firstModelSelectedRecorded) {
          if (this.emit(firstModelSelectedEvent, { model_id: next.model, provider: next.provider }))
            this.firstModelSelectedRecorded = true
          return
        }

        if (previous.provider && previous.provider !== next.provider) {
          this.emit(providerSwitchedEvent, {
            from_provider: previous.provider,
            to_provider: next.provider,
            from_provider_type: getProviderMode(previous.provider),
            to_provider_type: getProviderMode(next.provider),
            reason: 'manual',
            app_surface: analyticsSurface(),
          })
        }

        if (previous.model) {
          this.emit(modelSwitchedEvent, {
            from_model: previous.model,
            to_model: next.model,
            reason: 'manual',
          })
          this.emit(modelChangedEvent, {
            from_model: previous.model,
            to_model: next.model,
            provider: next.provider,
            reason: 'manual',
            app_surface: analyticsSurface(),
          })
        }
      },
      { immediate: true },
    )

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
