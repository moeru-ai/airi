import posthog from 'posthog-js'

import { isStageCapacitor, isStageTamagotchi } from '@proj-airi/stage-shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useSharedAnalyticsStore } from '../stores/analytics'
import { ensurePosthogInitialized, isPosthogAvailableInBuild } from '../stores/analytics/posthog'
import { getAnalyticsPrivacyPolicyUrl } from '../stores/analytics/privacy-policy'
import { useSettingsAnalytics } from '../stores/settings/analytics'
import { useSettingsGeneral } from '../stores/settings/general'

/**
 * User-facing chat surfaces that can emit product analytics.
 */
export type ConversationAnalyticsSurface = 'web' | 'mobile' | 'electron'

/**
 * Low-cardinality source names for conversation action events.
 */
export type ConversationAnalyticsSource = 'chat_controls' | 'history' | 'sessions_drawer'

export type ProviderMode = 'official' | 'custom' | 'unknown'
export type ChatActivationFailureStage = 'provider_config' | 'model_list' | 'message_send' | 'llm_response' | 'tts'
export type ProviderConfigStep = 'settings_auto_validate' | 'manual_chat_ping' | 'onboarding_validate'
export type VoiceType = 'official_default' | 'official_selected' | 'custom_configured' | 'voice_pack' | 'unknown'
export type VoiceAnalyticsSource = 'settings' | 'onboarding' | 'chat_auto_tts' | 'manual_preview'
export type OfficialProviderSelectionSource = 'settings' | 'onboarding' | 'default_auto'
export type OfficialTtsExposureSource = 'settings' | 'onboarding' | 'post_first_chat' | 'chat_controls'
export type FluxBalanceBucket = 'zero' | '1_100' | '101_1000' | '1001_10000' | '10000_plus' | 'unknown'
export type FeedbackSource = 'app' | 'discord' | 'qq' | 'github' | 'email' | 'other'
export type FeedbackCategory = 'provider_config' | 'model_list' | 'chat_activation' | 'tts' | 'voice_input' | 'performance' | 'payment' | 'ui_ux' | 'crash' | 'update' | 'live2d' | 'desktop_window' | 'mobile' | 'unknown'
export type FeedbackSeverity = 'blocker' | 'major' | 'minor' | 'suggestion'
export type FeedbackUserType = 'new_user' | 'paid_user' | 'overseas_user' | 'developer_user' | 'role_chat_user' | 'unknown'
export type FeedbackDescriptionLengthBucket = 'empty' | 'short' | 'medium' | 'long'
export type ProductAnalyticsEntry = 'app_start' | 'onboarding' | 'settings' | 'chat' | 'pricing' | 'quota_banner' | 'unknown'
export type MessageInputMode = 'text' | 'voice'
export type ConversationEventSource = 'new_session' | 'fork' | 'history' | 'share_button' | 'unknown'

/**
 * Full stage vocabulary of the cross-surface `oauth_callback_failed` event.
 * The web/PKCE stages fire from `pages/auth/callback.vue`; the electron
 * relay stages fire from ui-server-auth's `electron-callback.vue`, which
 * imports this type so the two emitters can't drift apart silently.
 */
export type OauthCallbackFailureStage
  = | 'provider_error'
    | 'missing_code_or_state'
    | 'missing_flow_state'
    | 'token_exchange_failed'
    | 'parse'
    | 'relay_unreachable'

interface ChatActivationBaseProperties {
  provider_mode: ProviderMode
  provider_id: string
  model_id: string
  source: 'text' | 'voice'
}

interface TtsVoiceBaseProperties {
  tts_provider_id: string
  tts_model_id: string
  source: VoiceAnalyticsSource
}

interface OfficialTtsBaseProperties {
  tts_provider_id: string
  tts_model_id: string
  source: OfficialTtsExposureSource
}

interface VoiceInputBaseProperties {
  stt_provider_id: string
  duration_ms?: number
}

interface ProviderConfigBaseProperties {
  provider_id: string
  provider_mode: ProviderMode
  step: ProviderConfigStep
}

interface FeedbackBaseProperties {
  source: FeedbackSource
  category: FeedbackCategory
  severity: FeedbackSeverity
  user_type: FeedbackUserType
  entrypoint: string
}

interface OnboardingProviderProperties {
  selected_provider_type: ProviderMode
  selected_provider_id?: string
  selected_use_case?: string
}

interface ConversationBaseProperties {
  conversation_id: string
  provider_type: ProviderMode
  provider_name: string
  model: string
}

function getConversationAnalyticsSurface(): ConversationAnalyticsSurface {
  if (isStageTamagotchi())
    return 'electron'

  if (isStageCapacitor())
    return 'mobile'

  return 'web'
}

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
   * The funnel terminator `payment_completed` is forwarded to PostHog
   * server-side by the product-events service (allowlist in
   * `apps/server/src/services/domain/product-events.ts`), keyed by the
   * Better Auth user id.
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

  function trackPaywallSeen(properties: {
    surface: string
    reason: 'manual_topup' | 'insufficient_balance' | 'checkout_recovery' | 'unknown'
    flux_balance_bucket: FluxBalanceBucket
  }) {
    if (!canCapture())
      return
    posthog.capture('paywall_seen', {
      surface: properties.surface,
      app_surface: getConversationAnalyticsSurface(),
      reason: properties.reason,
      flux_balance_bucket: properties.flux_balance_bucket,
    })
  }

  /**
   * OAuth/OIDC callback landing failed before a session existed. Stage
   * values map 1:1 to the guard branches in `pages/auth/callback.vue` so
   * the funnel can tell a provider-side denial from a lost PKCE state.
   */
  function trackOauthCallbackFailed(properties: {
    stage: Extract<OauthCallbackFailureStage, 'provider_error' | 'missing_code_or_state' | 'missing_flow_state' | 'token_exchange_failed'>
  }) {
    if (!canCapture())
      return
    posthog.capture('oauth_callback_failed', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  // ─── Account lifecycle (same event names as apps/ui-server-auth's
  // analytics module — both surfaces feed one PostHog series) ───────────

  function trackPasswordChanged() {
    if (!canCapture())
      return
    posthog.capture('password_changed', { surface: getConversationAnalyticsSurface() })
  }

  function trackPasswordResetRequested() {
    if (!canCapture())
      return
    posthog.capture('password_reset_requested', { surface: getConversationAnalyticsSurface() })
  }

  function trackOauthProviderLinkStarted(properties: { provider: string }) {
    if (!canCapture())
      return
    // The only caller (`useLinkedAccounts.link`) navigates to the OAuth
    // consent page right after this hook — the batched queue would race
    // the unload and drop the event, same as `trackCheckoutStarted`.
    posthog.capture(
      'oauth_provider_link_started',
      {
        ...properties,
        surface: getConversationAnalyticsSurface(),
      },
      { send_instantly: true, transport: 'sendBeacon' },
    )
  }

  function trackOauthProviderUnlinked(properties: { provider: string }) {
    if (!canCapture())
      return
    posthog.capture('oauth_provider_unlinked', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  /**
   * Deletion email sent (user confirmed in the dialog). The completion
   * event lands on ui-server-auth's success page; this one is the churn
   * intent signal even when the user never clicks the email link.
   */
  function trackAccountDeletionRequested() {
    if (!canCapture())
      return
    posthog.capture('account_deletion_requested', { surface: getConversationAnalyticsSurface() })
  }

  function trackSignupCompleted(properties: {
    source: string
    referrer?: string
    country?: string
    locale?: string
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
  }) {
    if (!canCapture())
      return
    posthog.capture('signup_completed', properties)
  }

  function trackOnboardingStarted(properties: { entry: ProductAnalyticsEntry }) {
    if (!canCapture())
      return
    posthog.capture('onboarding_started', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackOnboardingCompleted(properties: OnboardingProviderProperties) {
    if (!canCapture())
      return
    posthog.capture('onboarding_completed', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
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
    posthog.capture('model_changed', {
      from_model: fromModel,
      to_model: toModel,
      reason,
      surface: getConversationAnalyticsSurface(),
    })
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
  // server (apps/server/src/routes/openai/v1), which records them as
  // Postgres `product_events` rows — deliberately NOT forwarded to PostHog
  // (per-request volume stays in DB/Grafana). These client emits supply the
  // user-facing latency picture (TTFT, render time) the server cannot see.

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

  // ─── Chat activation events ──────────────────────────────────────────

  function trackChatActivationStarted(properties: ChatActivationBaseProperties) {
    if (!canCapture())
      return
    posthog.capture('chat_activation_started', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackChatActivationSucceeded(properties: ChatActivationBaseProperties & { time_to_first_message_ms?: number }) {
    if (!canCapture())
      return
    posthog.capture('chat_activation_succeeded', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackChatActivationFailed(properties: ChatActivationBaseProperties & {
    error_code: string
    failure_stage: ChatActivationFailureStage
  }) {
    if (!canCapture())
      return
    posthog.capture('chat_activation_failed', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackChatStarted(properties: ConversationBaseProperties & {
    entry: ProductAnalyticsEntry
    is_paid_user?: boolean
  }) {
    if (!canCapture())
      return
    posthog.capture('chat_started', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackOfficialProviderSelected(properties: {
    provider_id: string
    provider_mode: ProviderMode
    source: OfficialProviderSelectionSource
    auto_selected: boolean
    model_id?: string
  }) {
    if (!canCapture())
      return
    posthog.capture('official_provider_selected', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackMessageSent(properties: ConversationBaseProperties & {
    message_id?: string
    message_index?: number
    message_length?: number
    has_attachment: boolean
    mode: MessageInputMode
  }) {
    if (!canCapture())
      return
    posthog.capture('message_sent', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackAssistantResponseCompleted(properties: ConversationBaseProperties & {
    latency_ms?: number
    completion_length?: number
  }) {
    if (!canCapture())
      return
    posthog.capture('assistant_response_completed', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackChatFailed(properties: ConversationBaseProperties & {
    failure_stage: ChatActivationFailureStage
    error_code: string
  }) {
    if (!canCapture())
      return
    posthog.capture('chat_failed', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackSecondTurnStarted(properties: ChatActivationBaseProperties & { turn_index: number }) {
    if (!canCapture())
      return
    posthog.capture('second_turn_started', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackModelListLoaded(properties: {
    provider_id: string
    provider_mode: ProviderMode
    model_count: number
    duration_ms: number
  }) {
    if (!canCapture())
      return
    posthog.capture('model_list_loaded', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackModelListFailed(properties: {
    provider_id: string
    provider_mode: ProviderMode
    error_code: string
    duration_ms: number
  }) {
    if (!canCapture())
      return
    posthog.capture('model_list_failed', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackProviderConfigStarted(properties: ProviderConfigBaseProperties) {
    if (!canCapture())
      return
    posthog.capture('provider_config_started', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackProviderConfigSucceeded(properties: ProviderConfigBaseProperties & { duration_ms: number }) {
    if (!canCapture())
      return
    posthog.capture('provider_config_succeeded', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
    trackProviderConfigCompleted({
      ...properties,
      success: true,
    })
    if (properties.provider_mode === 'official') {
      trackOfficialProviderEnabled({
        provider_name: properties.provider_id,
        entry: properties.step === 'onboarding_validate' ? 'onboarding' : 'settings',
      })
    }
  }

  function trackProviderConfigFailed(properties: ProviderConfigBaseProperties & {
    error_code: string
    duration_ms: number
  }) {
    if (!canCapture())
      return
    posthog.capture('provider_config_failed', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackProviderConfigCompleted(properties: ProviderConfigBaseProperties & {
    duration_ms: number
    success: boolean
    error_code?: string
  }) {
    if (!canCapture())
      return
    posthog.capture('provider_config_completed', {
      ...properties,
      provider_type: properties.provider_mode,
      provider_name: properties.provider_id,
      entry_page: properties.step,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackOfficialProviderEnabled(properties: {
    provider_name: string
    entry: 'onboarding' | 'settings' | 'chat'
  }) {
    if (!canCapture())
      return
    posthog.capture('official_provider_enabled', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  // ─── Conversation action events ─────────────────────────────────────

  function trackTtsStopClicked(properties: { reason: 'manual-chat' }) {
    if (!canCapture())
      return
    posthog.capture('tts_stop_clicked', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackChatSessionSelected(properties: { source: 'sessions_drawer', message_count: number, cloud_synced: boolean }) {
    if (!canCapture())
      return
    posthog.capture('chat_session_selected', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackChatMessageDeleted(properties: { source: 'history', message_role: string }) {
    if (!canCapture())
      return
    posthog.capture('chat_message_deleted', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackChatMessagesCleared(properties: { source: 'chat_controls', message_count: number }) {
    if (!canCapture())
      return
    posthog.capture('chat_messages_cleared', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackChatMessageRetried(properties: { source: 'history' }) {
    if (!canCapture())
      return
    posthog.capture('chat_message_retried', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackConversationCreated(properties: {
    conversation_id: string
    source: ConversationEventSource
    character_id?: string
    cloud_synced: boolean
  }) {
    if (!canCapture())
      return
    posthog.capture('conversation_created', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackConversationRenamed(properties: {
    conversation_id: string
    source: 'history' | 'sessions_drawer' | 'unknown'
  }) {
    if (!canCapture())
      return
    posthog.capture('conversation_renamed', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackConversationShared(properties: {
    conversation_id: string
    source: ConversationEventSource
  }) {
    if (!canCapture())
      return
    posthog.capture('conversation_shared', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackConversationDeleted(properties: {
    conversation_id: string
    message_count: number
    cloud_synced: boolean
  }) {
    if (!canCapture())
      return
    posthog.capture('conversation_deleted', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
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

  function trackVoiceInputStarted(properties: VoiceInputBaseProperties) {
    if (!canCapture())
      return
    posthog.capture('voice_input_started', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
    posthog.capture('voice_input_used', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackMicrophonePermissionRequested(properties: VoiceInputBaseProperties) {
    if (!canCapture())
      return
    posthog.capture('microphone_permission_requested', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackMicrophonePermissionDenied(properties: VoiceInputBaseProperties & { error_code?: 'permission_denied' | string }) {
    if (!canCapture())
      return
    posthog.capture('microphone_permission_denied', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackAudioDeviceUnavailable(properties: VoiceInputBaseProperties & { error_code?: 'device_unavailable' | string }) {
    if (!canCapture())
      return
    posthog.capture('audio_device_unavailable', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackVoiceInputCancelled(properties: VoiceInputBaseProperties) {
    if (!canCapture())
      return
    posthog.capture('voice_input_cancelled', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  // ─── Feedback and community triage events ────────────────────────────

  function trackBugReportSubmitted(properties: FeedbackBaseProperties & {
    description_length_bucket: FeedbackDescriptionLengthBucket
    include_triage_context: boolean
    screenshot_attached: boolean
  }) {
    if (!canCapture())
      return
    posthog.capture('bug_report_submitted', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackFeedbackSubmitted(properties: FeedbackBaseProperties) {
    if (!canCapture())
      return
    posthog.capture('feedback_submitted', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
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
  // Selection events use catalog `voice_id` values for adoption analysis.
  // Custom voices must pass `voice_id = custom` from the callsite when the
  // raw provider value is user supplied.

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

  function trackTtsProviderSelected(properties: TtsVoiceBaseProperties) {
    if (!canCapture())
      return
    posthog.capture('tts_provider_selected', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackVoiceSelected(properties: TtsVoiceBaseProperties & {
    voice_id: string
    voice_type: VoiceType
    voice_pack_id?: string
  }) {
    if (!canCapture())
      return
    posthog.capture('voice_selected', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackVoicePreviewPlayed(properties: TtsVoiceBaseProperties & {
    voice_id: string
    voice_type: VoiceType
    voice_pack_id?: string
  }) {
    if (!canCapture())
      return
    posthog.capture('voice_preview_played', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackVoicePackBound(properties: TtsVoiceBaseProperties & {
    voice_id: string
    voice_pack_id: string
  }) {
    if (!canCapture())
      return
    posthog.capture('voice_pack_bound', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackAttachmentUploaded(properties: {
    attachment_type: 'image' | 'audio' | 'document' | 'unknown'
    size_bytes?: number
    source: ProductAnalyticsEntry
    success: boolean
  }) {
    if (!canCapture())
      return
    posthog.capture('attachment_uploaded', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackOfficialTtsExposed(properties: OfficialTtsBaseProperties) {
    if (!canCapture())
      return
    posthog.capture('official_tts_exposed', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackPresetUsed(properties: {
    preset_id: string
    preset_type: 'character' | 'stage_model' | 'voice' | 'background' | 'unknown'
    source: ProductAnalyticsEntry
  }) {
    if (!canCapture())
      return
    posthog.capture('preset_used', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackOfficialTtsPreviewStarted(properties: Omit<TtsVoiceBaseProperties, 'source'> & {
    voice_id: string
    voice_type: VoiceType
    voice_pack_id?: string
    source: Extract<VoiceAnalyticsSource, 'manual_preview'>
  }) {
    if (!canCapture())
      return
    posthog.capture('official_tts_preview_started', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackOfficialTtsPreviewSucceeded(properties: Omit<TtsVoiceBaseProperties, 'source'> & {
    voice_id: string
    voice_type: VoiceType
    voice_pack_id?: string
    source: Extract<VoiceAnalyticsSource, 'manual_preview'>
    duration_ms: number
  }) {
    if (!canCapture())
      return
    posthog.capture('official_tts_preview_succeeded', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackProviderSwitched(properties: {
    from_provider?: string
    to_provider: string
    from_provider_type?: ProviderMode
    to_provider_type: ProviderMode
    reason: 'manual' | 'auto'
  }) {
    if (!canCapture())
      return
    posthog.capture('provider_switched', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackSettingsChanged(properties: {
    setting_name: string
    previous_value?: string | number | boolean
    new_value: string | number | boolean
    source: ProductAnalyticsEntry
  }) {
    if (!canCapture())
      return
    posthog.capture('settings_changed', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackSupportContacted(properties: {
    channel: FeedbackSource
    source: ProductAnalyticsEntry
    category?: FeedbackCategory
  }) {
    if (!canCapture())
      return
    posthog.capture('support_contacted', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackOfficialTtsAutoEnabled(properties: Omit<TtsVoiceBaseProperties, 'source'> & {
    source: Extract<VoiceAnalyticsSource, 'settings' | 'chat_auto_tts'>
    enabled: boolean
  }) {
    if (!canCapture())
      return
    posthog.capture('official_tts_auto_enabled', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  // ─── Autonomous LLM path (artistry-autonomous bypasses chat orchestrator) ─

  function trackAutonomousGenerateText(properties: { model: string, reason?: string }) {
    if (!canCapture())
      return
    posthog.capture('autonomous_generate_text', properties)
  }

  // ─── AIRI card (ccv3 character card) events ──────────────────────────
  // `card_created` is emitted store-side (`stores/modules/airi-card.ts`)
  // because creation has three entry points; edit has exactly one
  // user-driven entry (the creation dialog in edit mode), so it lives
  // here. Background card writes (autonomous artistry, image journal,
  // scene background) intentionally do NOT count as edits.

  function trackCardEdited(properties: { card_id: string }) {
    if (!canCapture())
      return
    posthog.capture('card_edited', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  /** Stage background switched on the active card. `cleared` = set to none. */
  function trackSceneBackgroundSet(properties: { source: 'scene_settings' | 'card_gallery', cleared: boolean }) {
    if (!canCapture())
      return
    posthog.capture('scene_background_set', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  function trackCharacterUpdated(properties: { character_id: string }) {
    if (!canCapture())
      return
    posthog.capture('character_updated', properties)
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

  function trackQuotaLimitReached(properties: {
    limit_type: 'flux' | 'rate_limit' | 'subscription'
    current_usage: number
    limit_value?: number
    entry: ProductAnalyticsEntry
  }) {
    if (!canCapture())
      return
    posthog.capture('quota_limit_reached', properties)
  }

  function trackUpgradeClicked(properties: {
    source_page: string
    current_plan?: string
    trigger: 'quota_limit' | 'pricing_page' | 'manual_topup' | 'feature_gate'
  }) {
    if (!canCapture())
      return
    posthog.capture('upgrade_clicked', properties)
  }

  function trackFeatureUsed(properties: {
    feature_name: string
    business_domain: string
    entry: ProductAnalyticsEntry
    success: boolean
  }) {
    if (!canCapture())
      return
    posthog.capture('feature_used', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  // ─── Data maintenance (churn-precursor signals) ──────────────────────

  /**
   * One event for every destructive/exporting action on the data settings
   * page. Wipes and exports often precede churn, so cohorts built on this
   * event feed the at-risk-user list. Fires only after the action
   * succeeded — a failed wipe is not a churn signal.
   */
  function trackDataAction(properties: {
    action: 'chats_exported' | 'chats_imported' | 'chats_cleared' | 'app_data_cleared' | 'models_cache_cleared' | 'modules_settings_reset' | 'provider_settings_reset' | 'desktop_state_reset'
  }) {
    if (!canCapture())
      return
    posthog.capture('data_action', {
      ...properties,
      surface: getConversationAnalyticsSurface(),
    })
  }

  // ─── Desktop (Electron / Tamagotchi) differentiators ─────────────────
  // These measure whether the desktop-only surfaces earn their upkeep:
  // spotlight quick-input, floating widgets, the in-app updater, MCP
  // server management. Input text never leaves the device — events carry
  // counts and low-cardinality ids only.

  function trackSpotlightUsed() {
    if (!canCapture())
      return
    posthog.capture('spotlight_used')
  }

  function trackWidgetOpened(properties: { widget_id: string }) {
    if (!canCapture())
      return
    posthog.capture('widget_opened', properties)
  }

  function trackUpdateCheckClicked(properties: { channel: string }) {
    if (!canCapture())
      return
    posthog.capture('update_check_clicked', properties)
  }

  function trackUpdateDownloaded(properties: { channel: string, version?: string }) {
    if (!canCapture())
      return
    posthog.capture('update_downloaded', properties)
  }

  /** User confirmed restart-and-install; the app quits right after. */
  function trackUpdateInstallClicked(properties: { channel: string, version?: string }) {
    if (!canCapture())
      return
    posthog.capture('update_install_clicked', properties, { send_instantly: true, transport: 'sendBeacon' })
  }

  function trackMcpServerAdded() {
    if (!canCapture())
      return
    posthog.capture('mcp_server_added')
  }

  function trackMcpServerRemoved() {
    if (!canCapture())
      return
    posthog.capture('mcp_server_removed')
  }

  function trackMcpConnectionTestRun(properties: { success: boolean }) {
    if (!canCapture())
      return
    posthog.capture('mcp_connection_test_run', properties)
  }

  /** Pairing QR revealed — the funnel start for `device_channel_connected`. */
  function trackDevicePairingQrShown() {
    if (!canCapture())
      return
    posthog.capture('device_pairing_qr_shown')
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
    trackPaywallSeen,
    trackSignupCompleted,
    trackOauthCallbackFailed,
    trackPasswordChanged,
    trackPasswordResetRequested,
    trackOauthProviderLinkStarted,
    trackOauthProviderUnlinked,
    trackAccountDeletionRequested,
    trackOnboardingStarted,
    trackOnboardingCompleted,
    trackCharacterCreated,
    trackVoiceModeActivated,
    trackModelSwitched,
    trackChatSessionStarted,

    trackMessageSendStarted,
    trackLlmRequestStarted,
    trackLlmFirstToken,
    trackAssistantResponseRendered,
    trackAssistantResponseCompleted,
    trackMessageRound,
    trackChatStarted,
    trackMessageSent,
    trackChatFailed,
    trackChatActivationStarted,
    trackChatActivationSucceeded,
    trackChatActivationFailed,
    trackOfficialProviderSelected,
    trackSecondTurnStarted,
    trackModelListLoaded,
    trackModelListFailed,
    trackProviderConfigStarted,
    trackProviderConfigSucceeded,
    trackProviderConfigFailed,
    trackProviderConfigCompleted,
    trackOfficialProviderEnabled,
    trackTtsStopClicked,
    trackChatSessionSelected,
    trackChatMessageDeleted,
    trackChatMessagesCleared,
    trackChatMessageRetried,
    trackConversationCreated,
    trackConversationRenamed,
    trackConversationShared,
    trackConversationDeleted,

    trackSttStarted,
    trackSttSucceeded,
    trackSttFailed,
    trackVoiceInputStarted,
    trackMicrophonePermissionRequested,
    trackMicrophonePermissionDenied,
    trackAudioDeviceUnavailable,
    trackVoiceInputCancelled,
    trackBugReportSubmitted,
    trackFeedbackSubmitted,

    trackPttPressed,
    trackPttReleased,

    trackTtsIntentStarted,
    trackTtsIntentEnded,
    trackTtsIntentCancelled,
    trackTtsProviderSelected,
    trackVoiceSelected,
    trackVoicePreviewPlayed,
    trackVoicePackBound,
    trackAttachmentUploaded,
    trackPresetUsed,
    trackProviderSwitched,
    trackSettingsChanged,
    trackSupportContacted,
    trackOfficialTtsExposed,
    trackOfficialTtsPreviewStarted,
    trackOfficialTtsPreviewSucceeded,
    trackOfficialTtsAutoEnabled,

    trackAutonomousGenerateText,

    trackAppLoaded,

    trackCardEdited,
    trackSceneBackgroundSet,
    trackCharacterUpdated,
    trackCharacterDeleted,
    trackCharacterSwitched,
    trackChatSessionDeleted,
    trackOnboardingStepCompleted,
    trackOnboardingSkipped,

    trackFluxLowWarningShown,
    trackFluxTopupClicked,
    trackQuotaLimitReached,
    trackUpgradeClicked,
    trackFeatureUsed,
    trackVoiceCloneCreated,
    trackDeviceChannelConnected,

    trackDataAction,
    trackSpotlightUsed,
    trackWidgetOpened,
    trackUpdateCheckClicked,
    trackUpdateDownloaded,
    trackUpdateInstallClicked,
    trackMcpServerAdded,
    trackMcpServerRemoved,
    trackMcpConnectionTestRun,
    trackDevicePairingQrShown,
  }
}
