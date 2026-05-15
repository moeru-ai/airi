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

  /**
   * Pricing funnel — step 1.
   *
   * Use when:
   * - Any UI surface that shows Flux packages / subscription plans renders.
   *   Current surfaces: `settings_flux` (in-app billing settings). Future
   *   surfaces (a public pricing landing page, an upsell modal) just pass a
   *   different `surface` so the funnel split stays clean.
   *
   * Expects:
   * - `surface` is a stable identifier — don't rename without coordinating
   *   PostHog funnel definitions in `docs/ai-context/metrics-ownership.md`.
   */
  function trackPricingViewed(surface: string, planPeriod?: 'monthly' | 'annual' | 'one_time') {
    if (!canCapture())
      return
    posthog.capture('pricing_page_viewed', { surface, ...(planPeriod && { plan_period: planPeriod }) })
  }

  /**
   * Pricing funnel — step 2. Fires when the user picks a plan/package but
   * hasn't yet kicked off the Stripe checkout redirect.
   */
  function trackPlanSelected(planId: string, properties?: { price_minor_unit?: number, currency?: string }) {
    if (!canCapture())
      return
    posthog.capture('plan_selected', { plan_id: planId, ...properties })
  }

  /**
   * Pricing funnel — step 3. Fires right before redirecting to Stripe
   * checkout (i.e. the SPA has the `checkout_session_id` and is about to
   * `window.location.href = data.url`).
   *
   * Expects:
   * - Caller awaits or fire-and-forgets this call immediately before
   *   `window.location.href = ...`. We pass `send_instantly: true` and
   *   `transport: 'sendBeacon'` so the event survives page navigation —
   *   the regular batched queue would race the redirect and drop the
   *   event, which breaks the funnel.
   *
   * The funnel terminator `payment_completed` is emitted server-side from
   * the Stripe webhook — see `apps/server/src/routes/stripe/index.ts`.
   */
  function trackCheckoutStarted(planId: string, properties: { checkout_session_id?: string, price_minor_unit?: number, currency?: string }) {
    if (!canCapture())
      return
    posthog.capture(
      'checkout_started',
      { plan_id: planId, ...properties },
      { send_instantly: true, transport: 'sendBeacon' },
    )
  }

  /** Activation funnel — step 1. */
  function trackSignup(method: 'email' | 'google' | 'github' | string) {
    if (!canCapture())
      return
    posthog.capture('user_signed_up', { method })
  }

  /**
   * Activation funnel — fires the first time a user picks a model in any
   * provider settings. De-dup is intentional caller-side (we don't have a
   * persistent "first model selected" flag yet); a small number of repeats
   * is OK in PostHog funnels because step matching is per-distinctId, not
   * per-event.
   */
  function trackFirstModelSelected(modelId: string, provider: string) {
    if (!canCapture())
      return
    posthog.capture('first_model_selected', { model_id: modelId, provider })
  }

  /** Retention driver — character creation is a strong D7 retention predictor. */
  function trackCharacterCreated(properties: { character_type: 'built_in' | 'custom', voice_enabled: boolean }) {
    if (!canCapture())
      return
    posthog.capture('character_created', properties)
  }

  /** Feature adoption — voice mode is a candidate retention lever; cohort comparisons live in PostHog. */
  function trackVoiceModeActivated(characterId?: string) {
    if (!canCapture())
      return
    posthog.capture('voice_mode_activated', characterId ? { character_id: characterId } : {})
  }

  /**
   * Feature adoption — model switching frequency tells us whether
   * routing/auto-pick changes are needed. Reason discriminates manual UI
   * switch vs future auto-routing decisions.
   */
  function trackModelSwitched(fromModel: string, toModel: string, reason: 'manual' | 'auto' = 'manual') {
    if (!canCapture())
      return
    posthog.capture('model_switched', { from_model: fromModel, to_model: toModel, reason })
  }

  /**
   * Retention cohort denominator — every chat session start. Pair with
   * `payment_completed` cohort to compute "active paying user" retention
   * curves in PostHog.
   */
  function trackChatSessionStarted(modelId: string, sessionIndex?: number) {
    if (!canCapture())
      return
    posthog.capture('chat_session_started', { model_id: modelId, ...(sessionIndex != null && { session_index: sessionIndex }) })
  }

  return {
    privacyPolicyUrl,
    trackProviderClick,
    trackFirstMessage,
    trackPricingViewed,
    trackPlanSelected,
    trackCheckoutStarted,
    trackSignup,
    trackFirstModelSelected,
    trackCharacterCreated,
    trackVoiceModeActivated,
    trackModelSwitched,
    trackChatSessionStarted,
  }
}
