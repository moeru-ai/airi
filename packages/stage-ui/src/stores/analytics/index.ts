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

      this.isInitialized = true
    },
  },
})
