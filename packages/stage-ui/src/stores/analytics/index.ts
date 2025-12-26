import posthog from 'posthog-js'

import { defineStore } from 'pinia'

export const useSharedAnalyticsStore = defineStore('shared_analytics', {
  state: () => ({
    isInitialized: false,
    version: '',
    commit: '',
    buildTime: '',
  }),
  getters: {
    versionMeta: (state) => {
      return {
        app_version: state.version,
        app_commit: state.commit,
        app_build_time: state.buildTime,
      }
    },
  },
  actions: {
    initialize(version: string, commit: string, buildTime: Date | string) {
      if (this.isInitialized)
        return

      this.version = version
      this.commit = commit
      this.buildTime = buildTime instanceof Date ? buildTime.toISOString() : buildTime

      posthog.register(this.versionMeta)

      this.isInitialized = true
    },
  },
})
