import posthog from 'posthog-js'

export function useAnalytics() {
  function trackProviderClick(providerId: string, module: string) {
    posthog.capture('provider_card_clicked', {
      provider_id: providerId,
      module,
    })
  }

  return {
    trackProviderClick,
  }
}
