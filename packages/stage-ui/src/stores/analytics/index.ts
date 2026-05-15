import type { AboutBuildInfo } from '../../components/scenarios/about/types'

import { defineStore, storeToRefs } from 'pinia'
import { ref, watch } from 'vue'

import { useBuildInfo } from '../../composables/use-build-info'
import { useAuthStore } from '../auth'
import { useConsciousnessStore } from '../modules/consciousness'
import { useSettingsAnalytics } from '../settings/analytics'
import {
  capturePosthogEvent,
  identifyPosthogUser,
  isPosthogAvailableInBuild,
  registerPosthogBuildInfo,
  resetPosthog,
  syncPosthogCapture,
} from './posthog'

export * from './posthog'
export * from './privacy-policy'

export const useSharedAnalyticsStore = defineStore('analytics-shared', () => {
  const buildInfo = ref<AboutBuildInfo>(useBuildInfo())
  const settingsAnalytics = useSettingsAnalytics()
  const { analyticsEnabled } = storeToRefs(settingsAnalytics)
  const isInitialized = ref(false)

  const appStartTime = ref<number | null>(null)
  const firstMessageTracked = ref(false)
  // In-memory only, intentionally — matches `firstMessageTracked` semantics
  // (resets on reload). PostHog can compute true "first time across all
  // sessions" with `posthog.capture('first_*', ..., { send_instantly: true })`
  // + person-level dedup at query time.
  const firstModelSelectedTracked = ref(false)

  watch(analyticsEnabled, (enabled, previousEnabled) => {
    if (!isInitialized.value)
      return

    const shouldCapture = syncPosthogCapture(enabled)
    if (shouldCapture) {
      // When analytics is enabled mid-session, invalidate appStartTime and
      // mark first message as already tracked to avoid backfilling a stale
      // event with a misleading duration or timing.
      if (!previousEnabled && !firstMessageTracked.value) {
        appStartTime.value = null
        markFirstMessageTracked()
      }

      registerPosthogBuildInfo(buildInfo.value)
      // If a user enabled analytics mid-session while already authenticated,
      // identify them now — `initialize()`'s identify only fires once at
      // app startup and at auth-state changes, neither of which trigger
      // on a delayed opt-in. Without this, server-side `payment_completed`
      // (keyed by Better Auth user id) won't merge with the browser's
      // anonymous funnel events.
      const authStore = useAuthStore()
      if (authStore.isAuthenticated && authStore.user?.id)
        identifyPosthogUser(authStore.user.id)
    }
  })

  function initialize() {
    if (isInitialized.value)
      return

    appStartTime.value = Date.now()

    if (isPosthogAvailableInBuild()) {
      const shouldCapture = syncPosthogCapture(analyticsEnabled.value)
      if (shouldCapture)
        registerPosthogBuildInfo(buildInfo.value)
    }

    // Wire PostHog identity to auth state. Without this server-side events
    // (`payment_completed` keyed on Better Auth `user.id`) and browser-side
    // funnel events (anonymous `distinct_id` until identify) live on
    // different person profiles and the funnel never joins. See
    // `apps/server/docs/ai-context/metrics-ownership.md`.
    const authStore = useAuthStore()
    if (authStore.isAuthenticated && authStore.user?.id)
      identifyPosthogUser(authStore.user.id)

    authStore.onAuthenticated(() => {
      if (authStore.user?.id)
        identifyPosthogUser(authStore.user.id)
    })
    authStore.onLogout(() => {
      resetPosthog()
    })

    // Wire model-selection events. The consciousness store holds the
    // user-chosen chat model; both `activeProvider` and `activeModel` are
    // persisted via `useLocalStorageManualReset`, so on app load this
    // watcher fires once with the restored value as the "new" half (oldVal
    // is undefined). We guard on `oldProvider == null` to treat the boot
    // case as a baseline, not as a switch — otherwise every page load
    // would emit `model_switched`.
    //
    // Single `model_switched` callsite by design: consciousness reads/writes
    // happen across many UI surfaces (onboarding step, settings page,
    // model picker dropdown). Centralising the event here means new model-
    // change UI doesn't need to remember to fire analytics.
    const consciousness = useConsciousnessStore()
    watch(
      () => ({ provider: consciousness.activeProvider, model: consciousness.activeModel }),
      (next, prev) => {
        if (!next.provider || !next.model)
          return

        // Baseline on first watcher tick (oldVal undefined when the watcher
        // mounts with already-restored localStorage state).
        if (!prev) {
          if (!firstModelSelectedTracked.value) {
            // User has a model picked from a prior session — count it as
            // their first observed selection, but don't emit `model_switched`
            // since we have nothing to switch from. Only flip the dedup flag
            // when the capture actually went out (PostHog initialised + user
            // not opted out); otherwise an early opt-in or delayed init
            // would never get the chance to emit `first_model_selected`.
            const captured = capturePosthogEvent('first_model_selected', { model_id: next.model, provider: next.provider })
            if (captured)
              firstModelSelectedTracked.value = true
          }
          return
        }

        if (prev.provider === next.provider && prev.model === next.model)
          return

        if (!firstModelSelectedTracked.value) {
          // Same gating as the baseline branch: only mark first-selection
          // as tracked when capture actually shipped.
          const captured = capturePosthogEvent('first_model_selected', { model_id: next.model, provider: next.provider })
          if (captured)
            firstModelSelectedTracked.value = true
          return
        }

        // Genuine switch — emit only when we have a meaningful "from" model.
        // Provider transitions without a prior model (e.g. user clears then
        // re-selects) skip the switch event; the next clean A → B will fire.
        if (prev.model) {
          capturePosthogEvent('model_switched', {
            from_model: prev.model,
            to_model: next.model,
            reason: 'manual',
          })
        }
      },
      { immediate: true },
    )

    isInitialized.value = true
  }

  function markFirstMessageTracked() {
    firstMessageTracked.value = true
  }

  return {
    buildInfo,
    appStartTime,
    firstMessageTracked,
    initialize,
    markFirstMessageTracked,
  }
})
