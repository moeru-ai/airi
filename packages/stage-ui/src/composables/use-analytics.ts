import type { ControlsIslandAction } from '../libs/analytics/events/controls-island'
import type { SpeechOutputStopReason } from '../stores/speech-output-control'

import { isStageCapacitor, isStageTamagotchi } from '@proj-airi/stage-shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { captureAnalyticsEvent, enableAnalytics, getAnalytics, getAnalyticsPrivacyPolicyUrl, isAnalyticsAvailableInBuild } from '../libs/analytics'
import { captureTrackButtonEvent } from '../libs/analytics/events/interaction'
import { useSettingsAnalytics } from '../stores/settings/analytics'
import { useSettingsGeneral } from '../stores/settings/general'

export type AiUsageSource = 'estimated' | 'reported' | 'unavailable'

export type ChatActivationFailureStage = 'llm_response' | 'message_send' | 'model_list' | 'provider_config' | 'tts'

/**
 * Low-cardinality source names for conversation action events.
 */
export type ConversationAnalyticsSource = 'chat_controls' | 'history' | 'sessions_drawer'
/**
 * User-facing chat surfaces that can emit product analytics.
 */
export type ConversationAnalyticsSurface = 'electron' | 'mobile' | 'web'
export type ConversationEventSource = 'fork' | 'history' | 'new_session' | 'share_button' | 'unknown'
export type FeedbackCategory = 'chat_activation' | 'crash' | 'desktop_window' | 'live2d' | 'mobile' | 'model_list' | 'payment' | 'performance' | 'provider_config' | 'tts' | 'ui_ux' | 'unknown' | 'update' | 'voice_input'
export type FeedbackDescriptionLengthBucket = 'empty' | 'long' | 'medium' | 'short'
export type FeedbackSeverity = 'blocker' | 'major' | 'minor' | 'suggestion'
export type FeedbackSource = 'app' | 'discord' | 'email' | 'github' | 'other' | 'qq'
export type FeedbackUserType = 'developer_user' | 'new_user' | 'overseas_user' | 'paid_user' | 'role_chat_user' | 'unknown'
export type FluxBalanceBucket = '1_100' | '101_1000' | '1001_10000' | '10000_plus' | 'unknown' | 'zero'
export type MessageInputMode = 'text' | 'voice'
/**
 * Full stage vocabulary of the cross-surface `oauth_callback_failed` event.
 * The web/PKCE stages fire from `pages/auth/callback.vue`; the electron
 * relay stages fire from ui-server-auth's `electron-callback.vue`, which
 * imports this type so the two emitters can't drift apart silently.
 */
export type OauthCallbackFailureStage
  = | 'missing_code_or_state'
    | 'missing_flow_state'
    | 'parse'
    | 'provider_error'
    | 'relay_unreachable'
    | 'token_exchange_failed'
export type OfficialTtsExposureSource = 'chat_controls' | 'onboarding' | 'post_first_chat' | 'settings'
export type ProductAnalyticsEntry = 'app_start' | 'chat' | 'onboarding' | 'pricing' | 'quota_banner' | 'settings' | 'unknown'
export type ProviderMode = 'custom' | 'official' | 'unknown'
export type VoiceAnalyticsSource = 'chat_auto_tts' | 'manual_preview' | 'onboarding' | 'settings'
/** Stable, low-cardinality actions emitted by the Electron controls island. */
export type { ControlsIslandAction } from '../libs/analytics/events/controls-island'

export type VoiceType = 'custom_configured' | 'official_default' | 'official_selected' | 'unknown' | 'voice_pack'

interface ChatRoundCorrelationProperties {
  conversation_id: string
  round_id: string
  turn_index: number
}

interface ConversationBaseProperties {
  conversation_id: string
  model: string
  provider_name: string
  provider_type: ProviderMode
}

interface FeedbackBaseProperties {
  category: FeedbackCategory
  entrypoint: string
  severity: FeedbackSeverity
  source: FeedbackSource
  user_type: FeedbackUserType
}

interface OfficialTtsBaseProperties {
  source: OfficialTtsExposureSource
  tts_model_id: string
  tts_provider_id: string
}

interface OnboardingProviderProperties {
  selected_provider_id?: string
  selected_provider_type: ProviderMode
  selected_use_case?: string
}

interface ProviderConnectionTestProperties {
  provider_id: string
  provider_mode: ProviderMode
}

interface TtsVoiceBaseProperties {
  source: VoiceAnalyticsSource
  tts_model_id: string
  tts_provider_id: string
}

interface VoiceInputBaseProperties {
  duration_ms?: number
  stt_provider_id: string
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
      app_surface: getConversationAnalyticsSurface(),
      module,
      provider_id: providerId,
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
  function trackPricingViewed(entrySurface: string, planPeriod?: 'annual' | 'monthly' | 'one_time') {
    if (!canCapture())
      return
    captureAnalyticsEvent('pricing_page_viewed', { entry_surface: entrySurface, ...(planPeriod && { plan_period: planPeriod }) })
  }

  /**
   * Pricing funnel — step 2. Fires when the user picks a plan/package but
   * hasn't yet kicked off the Stripe checkout redirect.
   */
  function trackPlanSelected(planId: string, properties: { currency?: string, entry_surface: string, price_minor_unit?: number }) {
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
  function trackCheckoutStarted(planId: string, properties: { checkout_session_id?: string, currency?: string, entry_surface: string, price_minor_unit?: number }) {
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
    flux_balance_bucket: FluxBalanceBucket
    reason: 'checkout_recovery' | 'insufficient_balance' | 'manual_topup' | 'unknown'
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('paywall_seen', {
      app_surface: getConversationAnalyticsSurface(),
      entry_surface: properties.entry_surface,
      flux_balance_bucket: properties.flux_balance_bucket,
      reason: properties.reason,
    })
  }

  /**
   * OAuth/OIDC callback landing failed before a session existed. Stage
   * values map 1:1 to the guard branches in `pages/auth/callback.vue` so
   * the funnel can tell a provider-side denial from a lost PKCE state.
   */
  function trackOauthCallbackFailed(properties: {
    stage: Extract<OauthCallbackFailureStage, 'missing_code_or_state' | 'missing_flow_state' | 'provider_error' | 'token_exchange_failed'>
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
  function trackModelSwitched(fromModel: string, toModel: string, reason: 'auto' | 'manual' = 'manual') {
    if (!canCapture())
      return
    captureAnalyticsEvent('model_switched', {
      app_surface: getConversationAnalyticsSurface(),
      from_model: fromModel,
      reason,
      to_model: toModel,
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
    input_tokens?: number
    model_id: string
    output_tokens?: number
    provider_id: string
    provider_type: ProviderMode
    round_id: string
    total_tokens?: number
    usage_source: AiUsageSource
  }) {
    if (!canCapture())
      return

    const totalTokens = properties.total_tokens
      ?? (properties.input_tokens != null && properties.output_tokens != null
        ? properties.input_tokens + properties.output_tokens
        : undefined)

    captureAnalyticsEvent('$ai_generation', {
      $ai_model: properties.model_id,
      $ai_provider: properties.provider_id,
      $ai_session_id: properties.conversation_id,
      $ai_span_id: properties.round_id,
      $ai_trace_id: properties.conversation_id,
      ...(properties.input_tokens != null && { $ai_input_tokens: properties.input_tokens }),
      ...(properties.output_tokens != null && { $ai_output_tokens: properties.output_tokens }),
      ...(totalTokens != null && { $ai_total_tokens: totalTokens }),
      $insert_id: `ai-generation:${properties.round_id}`,
      app_surface: getConversationAnalyticsSurface(),
      capture_surface: 'client',
      conversation_id: properties.conversation_id,
      conversation_id_source: 'client_runtime',
      cost_usd_known: false,
      cost_usd_source: 'unavailable',
      provider_type: properties.provider_type,
      round_id: properties.round_id,
      token_usage_available: properties.usage_source !== 'unavailable',
      usage_source: properties.usage_source,
    })
  }

  /** Closing event for one full message round (user send → assistant render). */
  function trackMessageRound(properties: ChatRoundCorrelationProperties & {
    duration_ms: number
    has_voice: boolean
    input_tokens?: number
    model: string
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
    error_code: string
    failure_stage: ChatActivationFailureStage
    model_id: string
    provider_id: string
    source: 'text' | 'voice'
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('message_round_failed', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackMessageSent(properties: ConversationBaseProperties & {
    has_attachment: boolean
    message_id?: string
    message_index?: number
    message_length?: number
    mode: MessageInputMode
    round_id: string
    turn_index: number
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
    error_code?: string
    success: boolean
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

  function trackChatSessionSelected(properties: { cloud_synced: boolean, message_count: number, source: 'sessions_drawer' }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('chat_session_selected', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackChatMessageDeleted(properties: { message_role: string, source: 'history' }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('chat_message_deleted', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackChatMessagesCleared(properties: { message_count: number, source: 'chat_controls' }) {
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
    character_id?: string
    cloud_synced: boolean
    conversation_id: string
    source: ConversationEventSource
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
    cloud_synced: boolean
    conversation_id: string
    message_count: number
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('conversation_deleted', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  // ─── STT events ──────────────────────────────────────────────────────

  function trackSttSucceeded(properties: { char_count: number, latency_ms: number, provider: string, stream: boolean }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('stt_succeeded', properties)
  }

  function trackSttFailed(properties: { error_code?: string, provider: string }) {
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
    voice_pack_id?: string
    voice_type: VoiceType
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
    voice_pack_id?: string
    voice_type: VoiceType
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
    attachment_type: 'audio' | 'document' | 'image' | 'unknown'
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
    preset_type: 'background' | 'character' | 'stage_model' | 'unknown' | 'voice'
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
    source: Extract<VoiceAnalyticsSource, 'manual_preview'>
    voice_id: string
    voice_pack_id?: string
    voice_type: VoiceType
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('official_tts_preview_started', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackOfficialTtsPreviewSucceeded(properties: Omit<TtsVoiceBaseProperties, 'source'> & {
    duration_ms: number
    source: Extract<VoiceAnalyticsSource, 'manual_preview'>
    voice_id: string
    voice_pack_id?: string
    voice_type: VoiceType
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('official_tts_preview_succeeded', {
      ...properties,
      app_surface: getConversationAnalyticsSurface(),
    })
  }

  function trackSettingsChanged(properties: {
    new_value: boolean | number | string
    previous_value?: boolean | number | string
    setting_name: string
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
    category?: FeedbackCategory
    channel: FeedbackSource
    source: ProductAnalyticsEntry
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
  function trackSceneBackgroundSet(properties: { cleared: boolean, source: 'card_gallery' | 'scene_settings' }) {
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

  function trackAppLoaded(properties: { cold_start_ms?: number, platform: 'desktop' | 'mobile' | 'web', version: string }) {
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

  function trackChatSessionDeleted(properties: { message_count: number, session_id: string }) {
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
    current_usage: number
    entry: ProductAnalyticsEntry
    limit_type: 'flux' | 'rate_limit' | 'subscription'
    limit_value?: number
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('quota_limit_reached', properties)
  }

  function trackUpgradeClicked(properties: {
    current_plan?: string
    source_page: string
    trigger: 'feature_gate' | 'manual_topup' | 'pricing_page' | 'quota_limit'
  }) {
    if (!canCapture())
      return
    captureAnalyticsEvent('upgrade_clicked', properties)
  }

  function trackFeatureUsed(properties: {
    business_domain: string
    entry: ProductAnalyticsEntry
    feature_name: string
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
    action: 'app_data_cleared' | 'chats_cleared' | 'chats_exported' | 'chats_imported' | 'desktop_state_reset' | 'models_cache_cleared' | 'modules_settings_reset' | 'provider_settings_reset'
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
    captureTrackButtonEvent({ action: 'add', name: 'mcp_server_updated' })
  }

  function trackMcpServerRemoved() {
    captureTrackButtonEvent({ action: 'remove', name: 'mcp_server_updated' })
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
    trackAccountDeletionRequested,
    trackAiGeneration,
    trackAppLoaded,
    trackAttachmentUploaded,
    trackAutonomousGenerateText,
    trackBugReportSubmitted,
    trackCardEdited,
    trackCharacterCreated,
    trackCharacterDeleted,
    trackCharacterSwitched,
    trackCharacterUpdated,
    trackChatMessageDeleted,
    trackChatMessageRetried,
    trackChatMessagesCleared,
    trackChatSessionDeleted,
    trackChatSessionSelected,
    trackChatSessionStarted,
    trackCheckoutStarted,

    trackControlsIslandAction,
    trackConversationCreated,
    trackConversationDeleted,
    trackConversationRenamed,
    trackConversationShared,
    trackDataAction,
    trackDeviceChannelConnected,
    trackDevicePairingQrShown,
    trackFeatureUsed,
    trackFeedbackSubmitted,
    trackFirstMessage,
    trackFluxLowWarningShown,
    trackFluxTopupClicked,
    trackMcpConnectionTestRun,
    trackMcpServerAdded,
    trackMcpServerRemoved,

    trackMessageRound,
    trackMessageRoundFailed,
    trackMessageSent,
    trackMicrophonePermissionDenied,
    trackModelSwitched,
    trackOauthCallbackFailed,
    trackOauthProviderLinkStarted,

    trackOauthProviderUnlinked,
    trackOfficialTtsExposed,

    trackOfficialTtsPreviewStarted,
    trackOfficialTtsPreviewSucceeded,
    trackOnboardingCompleted,
    trackOnboardingSkipped,
    trackOnboardingStarted,
    trackOnboardingStepCompleted,
    trackPasswordChanged,
    trackPasswordResetRequested,
    trackPaywallSeen,
    trackPlanSelected,
    trackPresetUsed,

    trackPricingViewed,

    trackProviderClick,

    trackProviderConnectionTestCompleted,
    trackProviderConnectionTestStarted,
    trackPttPressed,
    trackPttReleased,
    trackQuotaLimitReached,
    trackSceneBackgroundSet,
    trackSettingsChanged,
    trackSpeechMuteToggled,

    trackSpotlightUsed,
    trackSttFailed,
    trackSttSucceeded,
    trackSupportContacted,
    trackTtsProviderSelected,
    trackTtsStopClicked,
    trackUpdateCheckClicked,

    trackUpdateDownloaded,
    trackUpdateInstallClicked,
    trackUpgradeClicked,
    trackVoiceCloneCreated,
    trackVoiceInputCancelled,
    trackVoiceInputStarted,
    trackVoiceModeActivated,
    trackVoicePackBound,
    trackVoicePreviewPlayed,
    trackVoiceSelected,
    trackWidgetOpened,
  }
}
