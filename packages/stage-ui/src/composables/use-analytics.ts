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

  // ─── LLM round events (client-known fields only) ──────────────────────
  // Source-of-truth for HTTP status / token usage / billing stage is the
  // server (apps/server/src/routes/openai/v1) — emitting those server-side
  // via captureSafe so PostHog has both perspectives merged on the same
  // distinctId. These client emits supply the user-facing latency picture
  // (TTFT, render time) that the server cannot see.

  function trackMessageSendStarted(properties: { source: 'text' | 'voice', model?: string }) {
    if (!canCapture())
      return
    posthog.capture('message_send_started', properties)
  }

  function trackLlmRequestStarted(properties: { model: string, provider: string, has_voice: boolean }) {
    if (!canCapture())
      return
    posthog.capture('llm_request_started', properties)
  }

  /** First token from a streaming LLM response — perceived responsiveness anchor. */
  function trackLlmFirstToken(properties: { model: string, ttfb_ms: number }) {
    if (!canCapture())
      return
    posthog.capture('llm_first_token', properties)
  }

  /** Stream finished and the UI has fully rendered the assistant message. */
  function trackAssistantResponseRendered(properties: { model: string, latency_ms: number }) {
    if (!canCapture())
      return
    posthog.capture('assistant_response_rendered', properties)
  }

  /** Closing event for one full message round (user send → assistant render). */
  function trackMessageRound(properties: { duration_ms: number, has_voice: boolean, model: string }) {
    if (!canCapture())
      return
    posthog.capture('message_round', properties)
  }

  // ─── STT events ──────────────────────────────────────────────────────

  function trackSttStarted(provider: string) {
    if (!canCapture())
      return
    posthog.capture('stt_started', { provider })
  }

  function trackSttSucceeded(properties: { provider: string, latency_ms: number, char_count: number, stream: boolean }) {
    if (!canCapture())
      return
    posthog.capture('stt_succeeded', properties)
  }

  function trackSttFailed(properties: { provider: string, error_code?: string }) {
    if (!canCapture())
      return
    posthog.capture('stt_failed', properties)
  }

  // ─── PTT events ──────────────────────────────────────────────────────

  function trackPttPressed() {
    if (!canCapture())
      return
    posthog.capture('ptt_pressed')
  }

  function trackPttReleased(holdMs: number) {
    if (!canCapture())
      return
    posthog.capture('ptt_released', { hold_ms: holdMs })
  }

  // ─── TTS events (forwarded from speech bus by use-speech-pipeline-analytics) ─
  // voice_id is `voice_type: 'catalog' | 'custom'` to keep cardinality
  // bounded — MiMo voice clone allows arbitrary user-supplied voice ids
  // (see codex F6). Actual voice_id is in properties for debug, NOT for
  // PostHog group-by.

  function trackTtsIntentStarted(properties: { intent_id: string, turn_id?: string }) {
    if (!canCapture())
      return
    posthog.capture('tts_intent_started', properties)
  }

  function trackTtsIntentEnded(properties: { intent_id: string, turn_id?: string, duration_ms: number }) {
    if (!canCapture())
      return
    posthog.capture('tts_intent_ended', properties)
  }

  function trackTtsIntentCancelled(properties: { intent_id: string, turn_id?: string, reason?: string }) {
    if (!canCapture())
      return
    posthog.capture('tts_intent_cancelled', properties)
  }

  // ─── Autonomous LLM path (artistry-autonomous bypasses chat orchestrator) ─

  function trackAutonomousGenerateText(properties: { model: string, reason?: string }) {
    if (!canCapture())
      return
    posthog.capture('autonomous_generate_text', properties)
  }

  // ─── App lifecycle ───────────────────────────────────────────────────

  function trackAppLoaded(properties: { platform: 'web' | 'desktop' | 'mobile', version: string, cold_start_ms?: number }) {
    if (!canCapture())
      return
    posthog.capture('app_loaded', properties)
  }

  // ─── Feature usage / retention ───────────────────────────────────────

  function trackCharacterDeleted(properties: { character_id: string }) {
    if (!canCapture())
      return
    posthog.capture('character_deleted', properties)
  }

  function trackCharacterSwitched(properties: { from_character_id?: string, to_character_id: string }) {
    if (!canCapture())
      return
    posthog.capture('character_switched', properties)
  }

  function trackChatSessionDeleted(properties: { session_id: string, message_count: number }) {
    if (!canCapture())
      return
    posthog.capture('chat_session_deleted', properties)
  }

  function trackOnboardingStepCompleted(step: string) {
    if (!canCapture())
      return
    posthog.capture('onboarding_step_completed', { step })
  }

  function trackOnboardingSkipped(at_step: string) {
    if (!canCapture())
      return
    posthog.capture('onboarding_skipped', { at_step })
  }

  // ─── Monetization (client side) ──────────────────────────────────────

  function trackFluxLowWarningShown(properties: { balance: number, threshold: number }) {
    if (!canCapture())
      return
    posthog.capture('flux_low_warning_shown', properties)
  }

  function trackFluxTopupClicked(properties: { balance: number, surface: string }) {
    if (!canCapture())
      return
    posthog.capture('flux_topup_clicked', properties)
  }

  // ─── Voice clone (custom TTS voice) ──────────────────────────────────

  function trackVoiceCloneCreated(properties: { provider: string }) {
    if (!canCapture())
      return
    posthog.capture('voice_clone_created', properties)
  }

  // ─── Device pairing / channel (Electron / Tamagotchi) ─────────────────

  function trackDeviceChannelConnected(properties: { channel: string }) {
    if (!canCapture())
      return
    posthog.capture('device_channel_connected', properties)
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

    trackMessageSendStarted,
    trackLlmRequestStarted,
    trackLlmFirstToken,
    trackAssistantResponseRendered,
    trackMessageRound,

    trackSttStarted,
    trackSttSucceeded,
    trackSttFailed,

    trackPttPressed,
    trackPttReleased,

    trackTtsIntentStarted,
    trackTtsIntentEnded,
    trackTtsIntentCancelled,

    trackAutonomousGenerateText,

    trackAppLoaded,

    trackCharacterDeleted,
    trackCharacterSwitched,
    trackChatSessionDeleted,
    trackOnboardingStepCompleted,
    trackOnboardingSkipped,

    trackFluxLowWarningShown,
    trackFluxTopupClicked,
    trackVoiceCloneCreated,
    trackDeviceChannelConnected,
  }
}
