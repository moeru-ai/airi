import type { AboutBuildInfo } from '../../components/scenarios/about/types'

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
    appStartTime.value = Date.now()
    isInitialized.value = true
  }

  function markFirstMessageTracked() {
    firstMessageTracked.value = true
  }

  return {
    buildInfo,
    versionMeta,
    appStartTime,
    firstMessageTracked,
    initialize,
    markFirstMessageTracked,
  }
})
