import posthog from 'posthog-js'

import { useSharedAnalyticsStore } from '../stores/analytics'

export function useAnalytics() {
  const analyticsStore = useSharedAnalyticsStore()

  function trackProviderClick(providerId: string, module: string) {
    posthog.capture('provider_card_clicked', {
      provider_id: providerId,
      module,
    })
  }

  function trackFirstMessage() {
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
