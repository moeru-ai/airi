import type { ControlsIslandAction } from '../libs/analytics/events/controls-island'
import type { SpeechOutputStopReason } from '../stores/speech-output-control'

import { isStageCapacitor, isStageTamagotchi } from '@proj-airi/stage-shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { captureAnalyticsEvent, enableAnalytics, getAnalytics, getAnalyticsPrivacyPolicyUrl, isAnalyticsAvailableInBuild } from '../libs/analytics'
import { captureTrackButtonEvent } from '../libs/analytics/events/interaction'
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
export type VoiceType = 'official_default' | 'official_selected' | 'custom_configured' | 'voice_pack' | 'unknown'
export type VoiceAnalyticsSource = 'settings' | 'onboarding' | 'chat_auto_tts' | 'manual_preview'
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
export type AiUsageSource = 'reported' | 'estimated' | 'unavailable'
/** Stable, low-cardinality actions emitted by the Electron controls island. */
export type { ControlsIslandAction } from '../libs/analytics/events/controls-island'

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

interface ChatRoundCorrelationProperties {
  conversation_id: string
  round_id: string
  turn_index: number
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

interface ProviderConnectionTestProperties {
  provider_id: string
  provider_mode: ProviderMode
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

export function getConversationAnalyticsSurface(): ConversationAnalyticsSurface {
  if (isStageTamagotchi())
    return 'electron'

  if (isStageCapacitor())
    return 'mobile'

  return 'web'
}

export function useAnalytics() {
  const analytics = getAnalytics()
  const settingsAnalytics = useSettingsAnalytics()
  const settingsGeneral = useSettingsGeneral()
  const { locale } = useI18n()

  const privacyPolicyUrl = computed(() => getAnalyticsPrivacyPolicyUrl(locale.value || settingsGeneral.language))

  const isAnalyticsEnabled = computed(() => isAnalyticsAvailableInBuild() && settingsAnalytics.analyticsEnabled)

  function canCapture(): boolean {
    if (!isAnalyticsEnabled.value)
      return false

    return enableAnalytics()
  }

  function trackProviderClick(providerId: string, module: string) {
    if (!canCapture())
      return

    captureAnalyticsEvent('provider_card_clicked', {
      provider_id: providerId,
      module,
      app_surface: getConversationAnalyticsSurface(),
      trigger_method: 'provider_card',
      trigger_type: 'user_action',
    })
  }

  function trackFirstMessage() {
    if (!canCapture())
      return

    analytics.recordFirstMessage()
  }

  /**
   * Pricing funnel — step 1.
   *
   * Use when:
   * - Any UI surface that shows Flux packages / subscription plans renders.
   *   Current surfaces: `settings_flux` (in-app billing settings). Future
   *   surfaces (a public pricing landing page, an upsell modal) just pass a
   *   different `entry_surface` so the funnel split stays clean.
   *
   * Expects:
   * - `entry_surface` is a stable identifier — don't rename without coordinating
   *   PostHog funnel definitions in `docs/ai-context/metrics-ownership.md`.
   */
  function trackPricingViewed(entrySurface: string, planPeriod?: 'monthly' | 'annual' | 'one_time') {
    if (!canCapture())
      return
    captureAnalyticsEvent('pricing_page_viewed', { entry_surface: entrySurface, ...(planPeriod && { plan_period: planPeriod }) })
  }

  /**
   * Pricing funnel — step 2. Fires when the user picks a plan/package but
   * hasn't yet kicked off the Stripe checkout redirect.
   */
  function trackPlanSelected(planId: string, properties: { entry_surface: string, price_minor_unit?: number, currency?: string }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('plan_selected', { plan_id: planId, ...properties })
  }

  /**
   * Pricing funnel — step 3. Fires right before redirecting to Stripe
   * checkout (i.e. the SPA has the `checkout_session_id` and is about to
   * `window.location.href = data.url`).
   *
   * Expects:
   * - Caller awaits or fire-and-forgets this call immediately before
   *   `window.location.href = ...`. `beforeNavigation` lets the installed
   *   adapter choose a delivery mechanism that survives document unload.
   *
   * The funnel terminator `payment_completed` is forwarded to PostHog
   * server-side by the product-events service, keyed by the Better Auth
   * user id.
   */
  function trackCheckoutStarted(planId: string, properties: { entry_surface: string, checkout_session_id?: string, price_minor_unit?: number, currency?: string }) {
    if (!canCapture())
      return
    captureAnalyticsEvent(
      'checkout_started',
      { plan_id: planId, ...properties },
      { beforeNavigation: true },
    )
  }

  function trackPaywallSeen(properties: {
    entry_surface: string
    reason: 'manual_topup' | 'insufficient_balance' | 'checkout_recovery' | 'unknown'
    flux_balance_bucket: FluxBalanceBucket
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('paywall_seen', {
      entry_surface: properties.entry_surface,
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
    captureAnalyticsEvent('oauth_callback_failed', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  // ─── Account lifecycle (same event names as apps/ui-server-auth's
  // analytics module — both surfaces feed one PostHog series) ───────────

  function trackPasswordChanged() {
    if (!canCapture())
      return
    captureAnalyticsEvent('password_changed', { app_surface: getConversationAnalyticsSurface() })
  }

  function trackPasswordResetRequested() {
    if (!canCapture())
      return
    captureAnalyticsEvent('password_reset_requested', { app_surface: getConversationAnalyticsSurface() })
  }

  function trackOauthProviderLinkStarted(properties: { provider: string }) {
    if (!canCapture())
      return
    // The only caller (`useLinkedAccounts.link`) navigates to the OAuth
    // consent page right after this hook — the batched queue would race
    // the unload and drop the event, same as `trackCheckoutStarted`.
    captureAnalyticsEvent(
      'oauth_provider_link_started',
      {
        ...properties,
        app_surface: getConversationAnalyticsSurface(),
      },
      { beforeNavigation: true },
    )
  }

  function trackOauthProviderUnlinked(properties: { provider: string }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('oauth_provider_unlinked', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
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
    captureAnalyticsEvent('account_deletion_requested', { app_surface: getConversationAnalyticsSurface() })
  }

  function trackOnboardingStarted(properties: { entry: ProductAnalyticsEntry }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('onboarding_started', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackOnboardingCompleted(properties: OnboardingProviderProperties) {
    if (!canCapture())
      return
    captureAnalyticsEvent('onboarding_completed', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  /** Retention driver — character creation is a strong D7 retention predictor. */
  function trackCharacterCreated(properties: { character_type: 'built_in' | 'custom', voice_enabled: boolean }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('character_created', properties)
  }

  /** Feature adoption — voice mode is a candidate retention lever; cohort comparisons live in PostHog. */
  function trackVoiceModeActivated(characterId?: string) {
    if (!canCapture())
      return
    captureAnalyticsEvent('voice_mode_activated', characterId ? { character_id: characterId } : {})
  }

  /**
   * Feature adoption — model switching frequency tells us whether
   * routing/auto-pick changes are needed. Reason discriminates manual UI
   * switch vs future auto-routing decisions.
   */
  function trackModelSwitched(fromModel: string, toModel: string, reason: 'manual' | 'auto' = 'manual') {
    if (!canCapture())
      return
    captureAnalyticsEvent('model_switched', {
      from_model: fromModel,
      to_model: toModel,
      reason,
      app_surface: getConversationAnalyticsSurface(),
      trigger_method: reason === 'manual' ? 'selection' : 'automatic',
      trigger_type: reason === 'manual' ? 'user_action' : 'user_flow_result',
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
    captureAnalyticsEvent('chat_session_started', { model_id: modelId, ...(sessionIndex != null && { session_index: sessionIndex }) })
  }

  /** Cost-fact event for one custom-provider generation; content is intentionally excluded. */
  function trackAiGeneration(properties: {
    conversation_id: string
    round_id: string
    provider_type: ProviderMode
    provider_id: string
    model_id: string
    usage_source: AiUsageSource
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
  }) {
    if (!canCapture())
      return

    const totalTokens = properties.total_tokens
      ?? (properties.input_tokens != null && properties.output_tokens != null
        ? properties.input_tokens + properties.output_tokens
        : undefined)

    captureAnalyticsEvent('$ai_generation', {
      $ai_trace_id: properties.conversation_id,
      $ai_session_id: properties.conversation_id,
      $ai_span_id: properties.round_id,
      $ai_model: properties.model_id,
      $ai_provider: properties.provider_id,
      ...(properties.input_tokens != null && { $ai_input_tokens: properties.input_tokens }),
      ...(properties.output_tokens != null && { $ai_output_tokens: properties.output_tokens }),
      ...(totalTokens != null && { $ai_total_tokens: totalTokens }),
      $insert_id: `ai-generation:${properties.round_id}`,
      app_surface: getConversationAnalyticsSurface(),
      capture_surface: 'client',
      conversation_id: properties.conversation_id,
      conversation_id_source: 'client_runtime',
      round_id: properties.round_id,
      provider_type: properties.provider_type,
      usage_source: properties.usage_source,
      token_usage_available: properties.usage_source !== 'unavailable',
      cost_usd_source: 'unavailable',
      cost_usd_known: false,
    })
  }

  /** Closing event for one full message round (user send → assistant render). */
  function trackMessageRound(properties: ChatRoundCorrelationProperties & {
    duration_ms: number
    has_voice: boolean
    model: string
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
    usage_source?: AiUsageSource
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('message_round', properties)
  }

  /** Canonical failure event for every user-to-assistant round, including post-activation turns. */
  function trackMessageRoundFailed(properties: ChatRoundCorrelationProperties & {
    provider_id: string
    model_id: string
    source: 'text' | 'voice'
    error_code: string
    failure_stage: ChatActivationFailureStage
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('message_round_failed', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackMessageSent(properties: ConversationBaseProperties & {
    round_id: string
    turn_index: number
    message_id?: string
    message_index?: number
    message_length?: number
    has_attachment: boolean
    mode: MessageInputMode
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('message_sent', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
      trigger_method: properties.mode === 'voice' ? 'voice' : 'text_input',
      trigger_type: 'user_action',
    })
  }

  function trackProviderConnectionTestStarted(properties: ProviderConnectionTestProperties) {
    if (!canCapture())
      return
    captureAnalyticsEvent('provider_connection_test_started', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
      trigger_method: 'button',
      trigger_type: 'user_action',
    })
  }

  function trackProviderConnectionTestCompleted(properties: ProviderConnectionTestProperties & {
    duration_ms: number
    success: boolean
    error_code?: string
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('provider_connection_test_completed', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
      trigger_method: 'button',
      trigger_type: 'user_flow_result',
    })
  }

  // ─── Conversation action events ─────────────────────────────────────

  function trackTtsStopClicked(properties: { reason: SpeechOutputStopReason }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('tts_stop_clicked', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackSpeechMuteToggled(properties: {
    muted: boolean
    was_speaking: boolean
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('speech_mute_toggled', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackChatSessionSelected(properties: { source: 'sessions_drawer', message_count: number, cloud_synced: boolean }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('chat_session_selected', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackChatMessageDeleted(properties: { source: 'history', message_role: string }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('chat_message_deleted', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackChatMessagesCleared(properties: { source: 'chat_controls', message_count: number }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('chat_messages_cleared', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackChatMessageRetried(properties: { source: 'history' }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('chat_message_retried', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
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
    captureAnalyticsEvent('conversation_created', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackConversationRenamed(properties: {
    conversation_id: string
    source: 'history' | 'sessions_drawer' | 'unknown'
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('conversation_renamed', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackConversationShared(properties: {
    conversation_id: string
    source: ConversationEventSource
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('conversation_shared', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackConversationDeleted(properties: {
    conversation_id: string
    message_count: number
    cloud_synced: boolean
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('conversation_deleted', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  // ─── STT events ──────────────────────────────────────────────────────

  function trackSttSucceeded(properties: { provider: string, latency_ms: number, char_count: number, stream: boolean }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('stt_succeeded', properties)
  }

  function trackSttFailed(properties: { provider: string, error_code?: string }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('stt_failed', properties)
  }

  function trackVoiceInputStarted(properties: VoiceInputBaseProperties) {
    if (!canCapture())
      return
    captureAnalyticsEvent('voice_input_started', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
      trigger_method: 'voice',
      trigger_type: 'user_action',
    })
  }

  function trackMicrophonePermissionDenied(properties: VoiceInputBaseProperties & { error_code?: 'permission_denied' | string }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('microphone_permission_denied', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
      trigger_method: 'voice',
      trigger_type: 'user_flow_result',
    })
  }

  function trackVoiceInputCancelled(properties: VoiceInputBaseProperties) {
    if (!canCapture())
      return
    captureAnalyticsEvent('voice_input_cancelled', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
      trigger_method: 'voice',
      trigger_type: 'user_flow_result',
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
    captureAnalyticsEvent('bug_report_submitted', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackFeedbackSubmitted(properties: FeedbackBaseProperties) {
    if (!canCapture())
      return
    captureAnalyticsEvent('feedback_submitted', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  // ─── PTT events ──────────────────────────────────────────────────────

  function trackPttPressed() {
    if (!canCapture())
      return
    captureAnalyticsEvent('ptt_pressed', {})
  }

  function trackPttReleased(holdMs: number) {
    if (!canCapture())
      return
    captureAnalyticsEvent('ptt_released', { hold_ms: holdMs })
  }

  // ─── TTS selection events ────────────────────────────────────────────
  // Selection events use catalog `voice_id` values for adoption analysis.
  // Custom voices must pass `voice_id = custom` from the callsite when the
  // raw provider value is user supplied.

  function trackTtsProviderSelected(properties: TtsVoiceBaseProperties) {
    if (!canCapture())
      return
    captureAnalyticsEvent('tts_provider_selected', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
      trigger_method: properties.source === 'chat_auto_tts' ? 'automatic' : 'selection',
      trigger_type: properties.source === 'chat_auto_tts' ? 'user_flow_result' : 'user_action',
    })
  }

  function trackVoiceSelected(properties: TtsVoiceBaseProperties & {
    voice_id: string
    voice_type: VoiceType
    voice_pack_id?: string
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('voice_selected', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackVoicePreviewPlayed(properties: TtsVoiceBaseProperties & {
    voice_id: string
    voice_type: VoiceType
    voice_pack_id?: string
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('voice_preview_played', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackVoicePackBound(properties: TtsVoiceBaseProperties & {
    voice_id: string
    voice_pack_id: string
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('voice_pack_bound', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
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
    captureAnalyticsEvent('attachment_uploaded', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackOfficialTtsExposed(properties: OfficialTtsBaseProperties) {
    if (!canCapture())
      return
    captureAnalyticsEvent('official_tts_exposed', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackPresetUsed(properties: {
    preset_id: string
    preset_type: 'character' | 'stage_model' | 'voice' | 'background' | 'unknown'
    source: ProductAnalyticsEntry
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('preset_used', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
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
    captureAnalyticsEvent('official_tts_preview_started', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
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
    captureAnalyticsEvent('official_tts_preview_succeeded', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
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
    captureAnalyticsEvent('settings_changed', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackSupportContacted(properties: {
    channel: FeedbackSource
    source: ProductAnalyticsEntry
    category?: FeedbackCategory
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('support_contacted', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  // ─── Autonomous LLM path (artistry-autonomous bypasses chat orchestrator) ─

  function trackAutonomousGenerateText(properties: { model: string, reason?: string }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('autonomous_generate_text', properties)
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
    captureAnalyticsEvent('card_edited', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  /** Stage background switched on the active card. `cleared` = set to none. */
  function trackSceneBackgroundSet(properties: { source: 'scene_settings' | 'card_gallery', cleared: boolean }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('scene_background_set', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackCharacterUpdated(properties: { character_id: string }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('character_updated', properties)
  }

  // ─── App lifecycle ───────────────────────────────────────────────────

  function trackAppLoaded(properties: { platform: 'web' | 'desktop' | 'mobile', version: string, cold_start_ms?: number }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('app_loaded', properties)
  }

  // ─── Feature usage / retention ───────────────────────────────────────

  function trackCharacterDeleted(properties: { character_id: string }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('character_deleted', properties)
  }

  function trackCharacterSwitched(properties: { from_character_id?: string, to_character_id: string }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('character_switched', properties)
  }

  function trackChatSessionDeleted(properties: { session_id: string, message_count: number }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('chat_session_deleted', properties)
  }

  function trackOnboardingStepCompleted(step: string) {
    if (!canCapture())
      return
    captureAnalyticsEvent('onboarding_step_completed', { step })
  }

  function trackOnboardingSkipped(at_step: string) {
    if (!canCapture())
      return
    captureAnalyticsEvent('onboarding_skipped', { at_step })
  }

  // ─── Monetization (client side) ──────────────────────────────────────

  function trackFluxLowWarningShown(properties: { balance: number, threshold: number }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('flux_low_warning_shown', properties)
  }

  function trackFluxTopupClicked(properties: { balance: number, entry_surface: string }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('flux_topup_clicked', properties)
  }

  function trackQuotaLimitReached(properties: {
    limit_type: 'flux' | 'rate_limit' | 'subscription'
    current_usage: number
    limit_value?: number
    entry: ProductAnalyticsEntry
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('quota_limit_reached', properties)
  }

  function trackUpgradeClicked(properties: {
    source_page: string
    current_plan?: string
    trigger: 'quota_limit' | 'pricing_page' | 'manual_topup' | 'feature_gate'
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('upgrade_clicked', properties)
  }

  function trackFeatureUsed(properties: {
    feature_name: string
    business_domain: string
    entry: ProductAnalyticsEntry
    success: boolean
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('feature_used', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
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
    captureAnalyticsEvent('data_action', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  // ─── Desktop (Electron / Tamagotchi) differentiators ─────────────────
  // These measure whether the desktop-only surfaces earn their upkeep:
  // spotlight quick-input, floating widgets, the in-app updater, MCP
  // server management. Input text never leaves the device — events carry
  // counts and low-cardinality ids only.

  function trackControlsIslandAction(properties: { action: ControlsIslandAction }) {
    captureTrackButtonEvent({ name: 'controls_island_action', ...properties })
  }

  function trackSpotlightUsed() {
    if (!canCapture())
      return
    captureAnalyticsEvent('spotlight_used', {})
  }

  function trackWidgetOpened(properties: { widget_id: string }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('widget_opened', properties)
  }

  function trackUpdateCheckClicked(properties: { channel: string }) {
    captureTrackButtonEvent({ name: 'update_check_clicked', ...properties })
  }

  function trackUpdateDownloaded(properties: { channel: string, version?: string }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('update_downloaded', properties)
  }

  /** User confirmed restart-and-install; the app quits right after. */
  function trackUpdateInstallClicked(properties: { channel: string, version?: string }) {
    captureTrackButtonEvent({ name: 'update_install_clicked', ...properties })
  }

  function trackMcpServerAdded() {
    captureTrackButtonEvent({ name: 'mcp_server_updated', action: 'add' })
  }

  function trackMcpServerRemoved() {
    captureTrackButtonEvent({ name: 'mcp_server_updated', action: 'remove' })
  }

  function trackMcpConnectionTestRun(properties: { success: boolean }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('mcp_connection_test_run', properties)
  }

  /** Pairing QR revealed — the funnel start for `device_channel_connected`. */
  function trackDevicePairingQrShown() {
    if (!canCapture())
      return
    captureAnalyticsEvent('device_pairing_qr_shown', {})
  }

  // ─── Voice clone (custom TTS voice) ──────────────────────────────────

  function trackVoiceCloneCreated(properties: { provider: string }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('voice_clone_created', properties)
  }

  // ─── Device pairing / channel (Electron / Tamagotchi) ─────────────────

  function trackDeviceChannelConnected(properties: { channel: string }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('device_channel_connected', properties)
  }

  return {
    privacyPolicyUrl,
    trackProviderClick,
    trackFirstMessage,
    trackPricingViewed,
    trackPlanSelected,
    trackCheckoutStarted,
    trackPaywallSeen,
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

    trackAiGeneration,
    trackMessageRound,
    trackMessageRoundFailed,
    trackMessageSent,
    trackProviderConnectionTestStarted,
    trackProviderConnectionTestCompleted,
    trackTtsStopClicked,
    trackSpeechMuteToggled,
    trackChatSessionSelected,
    trackChatMessageDeleted,
    trackChatMessagesCleared,
    trackChatMessageRetried,
    trackConversationCreated,
    trackConversationRenamed,
    trackConversationShared,
    trackConversationDeleted,

    trackSttSucceeded,
    trackSttFailed,
    trackVoiceInputStarted,
    trackMicrophonePermissionDenied,
    trackVoiceInputCancelled,
    trackBugReportSubmitted,
    trackFeedbackSubmitted,

    trackPttPressed,
    trackPttReleased,

    trackTtsProviderSelected,
    trackVoiceSelected,
    trackVoicePreviewPlayed,
    trackVoicePackBound,
    trackAttachmentUploaded,
    trackPresetUsed,
    trackSettingsChanged,
    trackSupportContacted,
    trackOfficialTtsExposed,
    trackOfficialTtsPreviewStarted,
    trackOfficialTtsPreviewSucceeded,

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
    trackControlsIslandAction,
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
