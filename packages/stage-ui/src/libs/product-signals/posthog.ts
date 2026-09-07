import type { AboutBuildInfo } from '../../components/scenarios/about/types'
import type { AnalyticsAdapter, AnalyticsAdapterOptions } from './client'

import posthog from 'posthog-js'

import { isStageCapacitor, isStageTamagotchi } from '@proj-airi/stage-shared'
import {
  DEFAULT_POSTHOG_CONFIG,
  POSTHOG_PROJECT_KEY,
} from '@proj-airi/stage-shared/analytics/posthog'

/** Creates and initializes the default PostHog adapter. */
export function createPosthogAdapter(options: AnalyticsAdapterOptions): AnalyticsAdapter {
  posthog.init(POSTHOG_PROJECT_KEY, {
    ...DEFAULT_POSTHOG_CONFIG,
    opt_out_capturing_by_default: !options.enabled,
  })
  posthog.register({ app_surface: currentSurface() })

  return {
    capture(name, properties, captureOptions) {
      if (posthog.has_opted_out_capturing())
        return false
      posthog.capture(
        name,
        { ...properties },
        captureOptions?.beforeNavigation
          ? { send_instantly: true, transport: 'sendBeacon' }
          : undefined,
      )
      return true
    },
    getIdentitySnapshot() {
      if (posthog.has_opted_out_capturing())
        return null

      const distinctId = posthog.get_distinct_id()
      if (!distinctId)
        return null

      const sessionId = posthog.get_session_id()
      return { distinctId, ...(sessionId && { sessionId }) }
    },
    identify(userId) {
      if (!posthog.has_opted_out_capturing())
        posthog.identify(userId)
    },
    registerBuildInfo(buildInfo: AboutBuildInfo) {
      posthog.register({
        app_branch: buildInfo.branch,
        app_build_time: buildInfo.builtOn,
        app_commit: buildInfo.commit,
        app_version: (buildInfo.version && buildInfo.version !== '0.0.0') ? buildInfo.version : 'dev',
      })
    },
    resetIdentity() {
      posthog.reset()
    },
    setCaptureEnabled(enabled) {
      if (enabled) {
        if (posthog.has_opted_out_capturing())
          posthog.opt_in_capturing()
        return true
      }

      if (!posthog.has_opted_out_capturing())
        posthog.opt_out_capturing()
      return false
    },
  }
}

function currentSurface(): 'electron' | 'mobile' | 'web' {
  if (isStageTamagotchi())
    return 'electron'
  if (isStageCapacitor())
    return 'mobile'
  return 'web'
}
