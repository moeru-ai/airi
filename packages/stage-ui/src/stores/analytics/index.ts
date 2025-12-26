import type { AboutBuildInfo } from '../../components/scenarios/about/types'

import posthog from 'posthog-js'

import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSharedAnalyticsStore = defineStore('shared_analytics', () => {
  const isInitialized = ref(false)
  const buildInfo = ref<AboutBuildInfo>({
    version: '',
    commit: '',
    branch: '',
    builtOn: '',
  })
  const appStartTime = ref<number | null>(null)
  const firstMessageTracked = ref(false)

  function initialize(info: AboutBuildInfo) {
    if (isInitialized.value)
      return

    buildInfo.value = info
    appStartTime.value = Date.now()

    // Register metadata with PostHog after buildInfo is set
    posthog.register({
      app_version: (buildInfo.value.version && buildInfo.value.version !== '0.0.0') ? buildInfo.value.version : 'dev',
      app_commit: buildInfo.value.commit,
      app_branch: buildInfo.value.branch,
      app_build_time: buildInfo.value.builtOn,
    })

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
