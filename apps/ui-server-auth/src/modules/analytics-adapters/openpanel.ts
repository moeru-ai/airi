import type { AnalyticsAdapter } from '../analytics'

import { OpenPanel } from '@openpanel/web'
import { OPENPANEL_CONFIG } from '@proj-airi/stage-shared/analytics/openpanel'

/** Sends auth milestones to the same OpenPanel project as the stage apps. */
export function createOpenpanelAdapter(): AnalyticsAdapter {
  const panel = new OpenPanel({
    ...OPENPANEL_CONFIG,
    trackScreenViews: true,
    filter(payload) {
      // OAuth codes and other query values must not enter analytics.
      if (payload.type === 'track' && payload.payload.properties) {
        for (const key of ['__path', '__referrer']) {
          const value = payload.payload.properties[key]
          if (typeof value === 'string')
            payload.payload.properties[key] = value.split(/[?#]/, 1)[0]
        }
      }
      return true
    },
  })
  panel.setGlobalProperties({ app_surface: 'auth' })

  return {
    capture(event, properties) {
      // Auth navigation must proceed even when the analytics endpoint fails.
      void panel.track(event, properties).catch(() => console.warn('[analytics] Product event delivery failed'))
    },
    identify(userId) {
      panel.identify({ profileId: userId })
    },
  }
}
