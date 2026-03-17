import type { AboutBuildInfo } from '../../components/scenarios/about/types'

import { defineStore, storeToRefs } from 'pinia'
import { ref, watch } from 'vue'

import { useBuildInfo } from '../../composables'
import { useSettingsGeneral } from '../settings'
import {
  isPosthogAvailableInBuild,
  registerPosthogBuildInfo,
  syncPosthogCapture,
} from './posthog'

export const useSharedAnalyticsStore = defineStore('analytics-shared', () => {
  const buildInfo = ref<AboutBuildInfo>(useBuildInfo())
  const settingsGeneral = useSettingsGeneral()
  const { analyticsEnabled } = storeToRefs(settingsGeneral)
  const isInitialized = ref(false)

  const appStartTime = ref<number | null>(null)
  const firstMessageTracked = ref(false)

  watch(analyticsEnabled, (enabled) => {
    if (!isInitialized.value)
      return

    const shouldCapture = syncPosthogCapture(enabled)
    if (shouldCapture)
      registerPosthogBuildInfo(buildInfo.value)
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
