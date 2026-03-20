import type { AboutBuildInfo } from '../../components/scenarios/about/types'

import { defineStore, storeToRefs } from 'pinia'
import { ref, watch } from 'vue'

import { useBuildInfo } from '../../composables/use-build-info'
import { useSettingsAnalytics } from '../settings/analytics'
import {
  isPosthogAvailableInBuild,
  registerPosthogBuildInfo,
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

  watch(analyticsEnabled, (enabled, previousEnabled) => {
    if (!isInitialized.value)
      return

    const shouldCapture = syncPosthogCapture(enabled)
    if (shouldCapture) {
      // Invalidate appStartTime when analytics is enabled mid-session so
      // trackFirstMessage sends time_to_first_message_ms: null instead of
      // a misleading duration measured from the original app launch.
      if (!previousEnabled)
        appStartTime.value = null

      registerPosthogBuildInfo(buildInfo.value)
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
