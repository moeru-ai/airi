import type { BeforeSendFn } from 'posthog-js'

import type { AnalyticsAdapter, AnalyticsAdapterOptions } from './client'

import posthog from 'posthog-js'

import { getStage, isStageTamagotchi } from '@proj-airi/stage-shared'
import { ANALYTICS_APP_ORIGINS } from '@proj-airi/stage-shared/analytics/app-origins'
import { DEFAULT_POSTHOG_CONFIG, POSTHOG_PROJECT_KEY, stripPosthogUrlQueries } from '@proj-airi/stage-shared/analytics/posthog'

import { analyticsAppName, analyticsSurface } from './surface'
import { reportAppLocation } from './utils/reported-location'

/** Gives the `before_send` chain of the running app. An installed app also hides the local page location. */
function beforeSend(): BeforeSendFn | BeforeSendFn[] {
  const appOrigin = ANALYTICS_APP_ORIGINS[getStage()]
  if (!appOrigin)
    return stripPosthogUrlQueries

  return [stripPosthogUrlQueries, (event) => {
    reportAppLocation(event.properties, appOrigin)
    reportAppLocation(event.$set, appOrigin)
    reportAppLocation(event.$set_once, appOrigin)
    return event
  }]
}

/** Sends product events to PostHog under the current consent and identity state. */
export function createPosthogAdapter(options: AnalyticsAdapterOptions): AnalyticsAdapter {
  // reset() also clears super properties. Keep them here and register them again.
  const superProperties: Record<string, string | undefined> = { app_client: analyticsAppName(), app_surface: analyticsSurface() }

  function restartIdentity(enabled: boolean): void {
    // reset() also clears the stored consent. Restore it after the reset.
    posthog.reset(true)
    if (enabled)
      posthog.opt_in_capturing({ captureEventName: false })
    else
      posthog.opt_out_capturing()
    posthog.register(superProperties)
  }

  posthog.init(POSTHOG_PROJECT_KEY, {
    ...DEFAULT_POSTHOG_CONFIG,
    before_send: beforeSend(),
    // The desktop app uses hash routes. A route change keeps `location.pathname`, so it needs the hash as well.
    ...(isStageTamagotchi() && { capture_pageview: { path: true, hash: true } }),
    opt_out_capturing_by_default: !options.enabled,
  })
  // A stored consent can disagree with the app setting. The app setting wins.
  if (options.enabled && posthog.has_opted_out_capturing())
    posthog.opt_in_capturing({ captureEventName: false })
  else if (!options.enabled && !posthog.has_opted_out_capturing())
    posthog.opt_out_capturing()
  posthog.register(superProperties)

  return {
    capture(name, properties, captureOptions) {
      if (posthog.has_opted_out_capturing())
        return false
      posthog.capture(
        name,
        { ...properties },
        captureOptions?.beforeNavigation ? { send_instantly: true, transport: 'sendBeacon' } : undefined,
      )
      return true
    },
    getIdentityHeaders() {
      if (posthog.has_opted_out_capturing())
        return null
      const distinctId = posthog.get_distinct_id()
      if (!distinctId)
        return null
      const sessionId = posthog.get_session_id()
      return {
        'x-posthog-distinct-id': distinctId,
        ...(sessionId && { 'x-posthog-session-id': sessionId }),
      }
    },
    identify(userId) {
      if (!posthog.has_opted_out_capturing())
        posthog.identify(userId)
    },
    registerBuildInfo(buildInfo) {
      Object.assign(superProperties, {
        app_branch: buildInfo.branch,
        app_build_time: buildInfo.builtOn,
        app_commit: buildInfo.commit,
        app_version: buildInfo.version && buildInfo.version !== '0.0.0' ? buildInfo.version : 'dev',
      })
      posthog.register(superProperties)
    },
    resetIdentity() {
      // Logout gets a new device id, so two accounts in one browser stay apart.
      restartIdentity(!posthog.has_opted_out_capturing())
    },
    setCaptureEnabled(enabled) {
      if (enabled === !posthog.has_opted_out_capturing())
        return enabled
      // A consent change starts a new device identity.
      restartIdentity(enabled)
      return enabled
    },
  }
}
