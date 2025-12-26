import type { AboutBuildInfo } from '../../components/scenarios/about/types'

import posthog from 'posthog-js'

import { defineStore } from 'pinia'

export const useSharedAnalyticsStore = defineStore('shared_analytics', {
  state: () => ({
    isInitialized: false,
    buildInfo: {
      version: '',
      commit: '',
      branch: '',
      builtOn: '',
    } as AboutBuildInfo,
    appStartTime: null as number | null,
    firstMessageTracked: false,
  }),
  getters: {
    versionMeta: (state) => {
      return {
        app_version: state.buildInfo.version === '0.0.0' ? 'dev' : state.buildInfo.version,
        app_commit: state.buildInfo.commit,
        app_branch: state.buildInfo.branch,
        app_build_time: state.buildInfo.builtOn,
      }
    },
  },
  actions: {
    initialize(buildInfo: AboutBuildInfo) {
      if (this.isInitialized)
        return

      this.buildInfo = buildInfo

      posthog.register(this.versionMeta)

      // Record app start time for first message tracking
      this.appStartTime = Date.now()

      this.isInitialized = true
    },
    trackFirstMessage(success: boolean, messageSentAt: number) {
      // Only track the first message once
      if (this.firstMessageTracked)
        return

      // Calculate time from app start to message sent
      const timeToFirstMessageMs = this.appStartTime ? messageSentAt - this.appStartTime : null

      posthog.capture('first_message_sent', {
        time_to_first_message_ms: timeToFirstMessageMs,
        success,
      })

      this.firstMessageTracked = true
    },
  },
})
