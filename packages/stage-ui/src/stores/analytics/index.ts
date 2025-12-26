import type { AboutBuildInfo } from '../../components/scenarios/about/types'

import posthog from 'posthog-js'

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

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

  const versionMeta = computed(() => ({
    app_version: buildInfo.value.version === '0.0.0' ? 'dev' : buildInfo.value.version,
    app_commit: buildInfo.value.commit,
    app_branch: buildInfo.value.branch,
    app_build_time: buildInfo.value.builtOn,
  }))

  function initialize(info: AboutBuildInfo) {
    if (isInitialized.value)
      return

    buildInfo.value = info

    posthog.register(versionMeta.value)

    // Record app start time for first message tracking
    appStartTime.value = Date.now()

    isInitialized.value = true
  }

  function trackFirstMessage(success: boolean, messageSentAt: number) {
    // Only track the first message once
    if (firstMessageTracked.value)
      return

    // Calculate time from app start to message sent
    const timeToFirstMessageMs = appStartTime.value ? messageSentAt - appStartTime.value : null

    posthog.capture('first_message_sent', {
      time_to_first_message_ms: timeToFirstMessageMs,
      success,
    })

    firstMessageTracked.value = true
  }

  return {
    buildInfo,
    versionMeta,
    initialize,
    trackFirstMessage,
  }
})
