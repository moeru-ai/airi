import posthog from 'posthog-js'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { POSTHOG_ENABLED } from '../../../../posthog.config'
import { useSharedAnalyticsStore } from '../stores/analytics'
import { getAnalyticsPrivacyPolicyUrl } from '../stores/analytics/privacy-policy'
import { useSettingsGeneral } from '../stores/settings'

export function useAnalytics() {
  const analyticsStore = useSharedAnalyticsStore()
  const settingsGeneral = useSettingsGeneral()
  const { locale } = useI18n()

  const privacyPolicyUrl = computed(() => getAnalyticsPrivacyPolicyUrl(locale.value || settingsGeneral.language))

  const isAnalyticsEnabled = computed(() => POSTHOG_ENABLED && settingsGeneral.analyticsEnabled)

  function trackProviderClick(providerId: string, module: string) {
    if (!isAnalyticsEnabled.value)
      return

    posthog.capture('provider_card_clicked', {
      provider_id: providerId,
      module,
    })
  }

  function trackFirstMessage() {
    if (!isAnalyticsEnabled.value)
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
    privacyPolicyUrl,
    trackProviderClick,
    trackFirstMessage,
  }
}
