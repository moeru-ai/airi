import posthog from 'posthog-js'

import { POSTHOG_ENABLED } from '../../../../posthog.config'
import { useSharedAnalyticsStore } from '../stores/analytics'
import { useSettingsGeneral } from '../stores/settings'

export function useAnalytics() {
  const analyticsStore = useSharedAnalyticsStore()
  const settingsGeneral = useSettingsGeneral()

  function isAnalyticsEnabled() {
    return POSTHOG_ENABLED && settingsGeneral.analyticsEnabled
  }

  function trackProviderClick(providerId: string, module: string) {
    if (!isAnalyticsEnabled())
      return

    posthog.capture('provider_card_clicked', {
      provider_id: providerId,
      module,
    })
  }

  function trackFirstMessage() {
    if (!isAnalyticsEnabled())
      return

    // Only track the first message once
    if (analyticsStore.firstMessageTracked)
      return

    analyticsStore.markFirstMessageTracked()

    // Calculate time from app start to message sent
    const timeToFirstMessageMs = analyticsStore.appStartTime
      ? Date.now() - analyticsStore.appStartTime
      : null

    posthog.capture('first_message_sent', {
      time_to_first_message_ms: timeToFirstMessageMs,
    })
  }

  return {
    trackProviderClick,
    trackFirstMessage,
  }
}
