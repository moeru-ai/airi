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
      // When analytics is enabled mid-session, invalidate appStartTime and
      // mark first message as already tracked to avoid backfilling a stale
      // event with a misleading duration or timing.
      if (!previousEnabled && !firstMessageTracked.value) {
        appStartTime.value = null
        markFirstMessageTracked()
      }

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
