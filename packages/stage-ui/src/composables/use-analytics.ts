import posthog from 'posthog-js'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useSharedAnalyticsStore } from '../stores/analytics'
import { ensurePosthogInitialized, isPosthogAvailableInBuild } from '../stores/analytics/posthog'
import { getAnalyticsPrivacyPolicyUrl } from '../stores/analytics/privacy-policy'
import { useSettingsAnalytics } from '../stores/settings/analytics'
import { useSettingsGeneral } from '../stores/settings/general'

export function useAnalytics() {
  const analyticsStore = useSharedAnalyticsStore()
  const settingsAnalytics = useSettingsAnalytics()
  const settingsGeneral = useSettingsGeneral()
  const { locale } = useI18n()

  const privacyPolicyUrl = computed(() => getAnalyticsPrivacyPolicyUrl(locale.value || settingsGeneral.language))

  const isAnalyticsEnabled = computed(() => isPosthogAvailableInBuild() && settingsAnalytics.analyticsEnabled)

  function canCapture(): boolean {
    if (!isAnalyticsEnabled.value)
      return false

    // Ensure PostHog is initialized before any capture call.
    return ensurePosthogInitialized(true)
  }

  function trackProviderClick(providerId: string, module: string) {
    if (!canCapture())
      return

    posthog.capture('provider_card_clicked', {
      provider_id: providerId,
      module,
    })
  }

  function trackFirstMessage() {
    if (!canCapture())
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
