import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useAnalytics } from './use-analytics'

const analyticsMocks = vi.hoisted(() => ({
  ensureAnalyticsInitializedMock: vi.fn(() => true),
  isAnalyticsAvailableInBuildMock: vi.fn(() => true),
  isStageCapacitorMock: vi.fn(() => false),
  isStageTamagotchiMock: vi.fn(() => false),
  posthogCaptureMock: vi.fn(),
  recordFirstMessageMock: vi.fn(() => true),
}))

vi.mock('@proj-airi/stage-shared', () => ({
  getStage: () => analyticsMocks.isStageTamagotchiMock()
    ? 'tamagotchi'
    : analyticsMocks.isStageCapacitorMock()
      ? 'capacitor'
      : 'web',
  isStageCapacitor: analyticsMocks.isStageCapacitorMock,
  isStageTamagotchi: analyticsMocks.isStageTamagotchiMock,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: ref('en'),
  }),
}))

vi.mock('../libs/analytics', () => ({
  captureAnalyticsEvent: analyticsMocks.posthogCaptureMock,
  enableAnalytics: analyticsMocks.ensureAnalyticsInitializedMock,
  getAnalytics: () => ({
    emit: (event: { name: string }, payload: object, options?: object) => {
      if (options)
        return analyticsMocks.posthogCaptureMock(event.name, payload, options)

      return analyticsMocks.posthogCaptureMock(event.name, payload)
    },
    recordFirstMessage: analyticsMocks.recordFirstMessageMock,
  }),
  getAnalyticsPrivacyPolicyUrl: () => 'https://example.com/privacy',
  isAnalyticsAvailableInBuild: analyticsMocks.isAnalyticsAvailableInBuildMock,
}))

vi.mock('../stores/settings/analytics', () => ({
  useSettingsAnalytics: () => ({
    analyticsEnabled: true,
  }),
}))

vi.mock('../stores/settings/general', () => ({
  useSettingsGeneral: () => ({
    language: 'en',
  }),
}))

describe('useAnalytics conversation product events', () => {
  beforeEach(() => {
    analyticsMocks.posthogCaptureMock.mockClear()
    analyticsMocks.recordFirstMessageMock.mockClear()
    analyticsMocks.ensureAnalyticsInitializedMock.mockClear()
    analyticsMocks.isStageCapacitorMock.mockReset()
    analyticsMocks.isStageTamagotchiMock.mockReset()
    analyticsMocks.isStageCapacitorMock.mockReturnValue(false)
    analyticsMocks.isStageTamagotchiMock.mockReturnValue(false)
    analyticsMocks.isAnalyticsAvailableInBuildMock.mockClear()
  })

  it('uses app_surface for the web runtime without occupying the event entry surface', () => {
    const analytics = useAnalytics()

    analytics.trackTtsStopClicked({
      reason: 'manual-chat',
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenCalledWith('tts_stop_clicked', {
      app_surface: 'web',
      reason: 'manual-chat',
    })
  })

  it('captures speech mute state changes without conversation or audio content', () => {
    const analytics = useAnalytics()

    analytics.trackSpeechMuteToggled({
      muted: true,
      was_speaking: true,
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenCalledWith('speech_mute_toggled', {
      app_surface: 'web',
      muted: true,
      was_speaking: true,
    })
  })

  it('captures custom-provider token usage without prompt or response content', () => {
    const analytics = useAnalytics()

    analytics.trackAiGeneration({
      conversation_id: 'session-1',
      input_tokens: 12,
      model_id: 'custom-model',
      output_tokens: 8,
      provider_id: 'openai-compatible',
      provider_type: 'custom',
      round_id: 'round-1',
      usage_source: 'reported',
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenCalledWith('$ai_generation', {
      $ai_input_tokens: 12,
      $ai_model: 'custom-model',
      $ai_output_tokens: 8,
      $ai_provider: 'openai-compatible',
      $ai_session_id: 'session-1',
      $ai_span_id: 'round-1',
      $ai_total_tokens: 20,
      $ai_trace_id: 'session-1',
      $insert_id: 'ai-generation:round-1',
      app_surface: 'web',
      capture_surface: 'client',
      conversation_id: 'session-1',
      conversation_id_source: 'client_runtime',
      cost_usd_known: false,
      cost_usd_source: 'unavailable',
      provider_type: 'custom',
      round_id: 'round-1',
      token_usage_available: true,
      usage_source: 'reported',
    })
  })

  it('records unavailable custom-provider usage without inventing token or cost fields', () => {
    const analytics = useAnalytics()

    analytics.trackAiGeneration({
      conversation_id: 'session-1',
      model_id: 'local-model',
      provider_id: 'ollama',
      provider_type: 'custom',
      round_id: 'round-2',
      usage_source: 'unavailable',
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenCalledWith('$ai_generation', {
      $ai_model: 'local-model',
      $ai_provider: 'ollama',
      $ai_session_id: 'session-1',
      $ai_span_id: 'round-2',
      $ai_trace_id: 'session-1',
      $insert_id: 'ai-generation:round-2',
      app_surface: 'web',
      capture_surface: 'client',
      conversation_id: 'session-1',
      conversation_id_source: 'client_runtime',
      cost_usd_known: false,
      cost_usd_source: 'unavailable',
      provider_type: 'custom',
      round_id: 'round-2',
      token_usage_available: false,
      usage_source: 'unavailable',
    })
  })

  it('infers the mobile surface for capacitor conversation actions', () => {
    analyticsMocks.isStageCapacitorMock.mockReturnValue(true)
    const analytics = useAnalytics()

    analytics.trackChatSessionSelected({
      cloud_synced: true,
      message_count: 4,
      source: 'sessions_drawer',
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenCalledWith('chat_session_selected', {
      app_surface: 'mobile',
      cloud_synced: true,
      message_count: 4,
      source: 'sessions_drawer',
    })
  })

  it('infers the electron surface for destructive and recovery chat message actions', () => {
    analyticsMocks.isStageTamagotchiMock.mockReturnValue(true)
    const analytics = useAnalytics()

    analytics.trackChatMessageDeleted({
      message_role: 'assistant',
      source: 'history',
    })
    analytics.trackChatMessagesCleared({
      message_count: 3,
      source: 'chat_controls',
    })
    analytics.trackChatMessageRetried({
      source: 'history',
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'chat_message_deleted', {
      app_surface: 'electron',
      message_role: 'assistant',
      source: 'history',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'chat_messages_cleared', {
      app_surface: 'electron',
      message_count: 3,
      source: 'chat_controls',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(3, 'chat_message_retried', {
      app_surface: 'electron',
      source: 'history',
    })
  })

  /**
   * @example
   * analytics.trackVoiceSelected({ tts_provider_id: 'official-provider', tts_model_id: 'stepfun/tts', voice_id: 'voice-1', voice_type: 'official_selected', source: 'settings' })
   * expect(posthog.capture).toHaveBeenCalledWith('voice_selected', expect.objectContaining({ voice_id: 'voice-1' }))
   */
  it('emits TTS voice selection events without losing provider context', () => {
    const analytics = useAnalytics()

    analytics.trackTtsProviderSelected({
      source: 'settings',
      tts_model_id: 'stepfun/tts',
      tts_provider_id: 'official-provider',
    })
    analytics.trackVoiceSelected({
      source: 'settings',
      tts_model_id: 'stepfun/tts',
      tts_provider_id: 'official-provider',
      voice_id: 'longxiaochun_v2',
      voice_type: 'official_selected',
    })
    analytics.trackVoicePreviewPlayed({
      source: 'manual_preview',
      tts_model_id: 'stepfun/tts',
      tts_provider_id: 'official-provider',
      voice_id: 'longxiaochun_v2',
      voice_type: 'official_selected',
    })
    analytics.trackVoicePackBound({
      source: 'settings',
      tts_model_id: 'stepfun/tts',
      tts_provider_id: 'official-provider',
      voice_id: 'longxiaochun_v2',
      voice_pack_id: 'pack-1',
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'tts_provider_selected', {
      app_surface: 'web',
      source: 'settings',
      trigger_method: 'selection',
      trigger_type: 'user_action',
      tts_model_id: 'stepfun/tts',
      tts_provider_id: 'official-provider',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'voice_selected', {
      app_surface: 'web',
      source: 'settings',
      tts_model_id: 'stepfun/tts',
      tts_provider_id: 'official-provider',
      voice_id: 'longxiaochun_v2',
      voice_type: 'official_selected',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(3, 'voice_preview_played', {
      app_surface: 'web',
      source: 'manual_preview',
      tts_model_id: 'stepfun/tts',
      tts_provider_id: 'official-provider',
      voice_id: 'longxiaochun_v2',
      voice_type: 'official_selected',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(4, 'voice_pack_bound', {
      app_surface: 'web',
      source: 'settings',
      tts_model_id: 'stepfun/tts',
      tts_provider_id: 'official-provider',
      voice_id: 'longxiaochun_v2',
      voice_pack_id: 'pack-1',
    })
  })

  /**
   * @example
   * analytics.trackOfficialTtsExposed({ source: 'post_first_chat', tts_provider_id: 'official-provider-speech', tts_model_id: 'stepfun/tts' })
   * expect(posthog.capture).toHaveBeenCalledWith('official_tts_exposed', expect.objectContaining({ source: 'post_first_chat' }))
   */
  it('emits official TTS activation funnel events', () => {
    const analytics = useAnalytics()

    analytics.trackOfficialTtsExposed({
      source: 'post_first_chat',
      tts_model_id: 'stepfun/tts',
      tts_provider_id: 'official-provider-speech',
    })
    analytics.trackOfficialTtsPreviewStarted({
      source: 'manual_preview',
      tts_model_id: 'stepfun/tts',
      tts_provider_id: 'official-provider-speech',
      voice_id: 'longxiaochun_v2',
      voice_type: 'official_selected',
    })
    analytics.trackOfficialTtsPreviewSucceeded({
      duration_ms: 320,
      source: 'manual_preview',
      tts_model_id: 'stepfun/tts',
      tts_provider_id: 'official-provider-speech',
      voice_id: 'longxiaochun_v2',
      voice_type: 'official_selected',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'official_tts_exposed', {
      app_surface: 'web',
      source: 'post_first_chat',
      tts_model_id: 'stepfun/tts',
      tts_provider_id: 'official-provider-speech',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'official_tts_preview_started', {
      app_surface: 'web',
      source: 'manual_preview',
      tts_model_id: 'stepfun/tts',
      tts_provider_id: 'official-provider-speech',
      voice_id: 'longxiaochun_v2',
      voice_type: 'official_selected',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(3, 'official_tts_preview_succeeded', {
      app_surface: 'web',
      duration_ms: 320,
      source: 'manual_preview',
      tts_model_id: 'stepfun/tts',
      tts_provider_id: 'official-provider-speech',
      voice_id: 'longxiaochun_v2',
      voice_type: 'official_selected',
    })
  })

  it('emits paywall exposure with balance bucket for monetization funnels', () => {
    const analytics = useAnalytics()

    analytics.trackPaywallSeen({
      entry_surface: 'settings_flux',
      flux_balance_bucket: '1_100',
      reason: 'manual_topup',
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenCalledWith('paywall_seen', {
      app_surface: 'web',
      entry_surface: 'settings_flux',
      flux_balance_bucket: '1_100',
      reason: 'manual_topup',
    })
  })

  it('uses entry_surface across the pricing funnel without emitting surface', () => {
    const analytics = useAnalytics()

    analytics.trackPricingViewed('settings_flux', 'one_time')
    analytics.trackPlanSelected('price-1', {
      currency: 'USD',
      entry_surface: 'settings_flux',
    })
    analytics.trackCheckoutStarted('price-1', {
      currency: 'USD',
      entry_surface: 'settings_flux',
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'pricing_page_viewed', {
      entry_surface: 'settings_flux',
      plan_period: 'one_time',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'plan_selected', {
      currency: 'USD',
      entry_surface: 'settings_flux',
      plan_id: 'price-1',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(3, 'checkout_started', {
      currency: 'USD',
      entry_surface: 'settings_flux',
      plan_id: 'price-1',
    }, { beforeNavigation: true })
  })

  /**
   * @example
   * analytics.trackMicrophonePermissionDenied({ stt_provider_id: 'browser-web-speech-api' })
   * expect(posthog.capture).toHaveBeenCalledWith('microphone_permission_denied', expect.objectContaining({ app_surface: 'web' }))
   */
  it('emits one voice action and only user-relevant outcome events', () => {
    const analytics = useAnalytics()

    analytics.trackVoiceInputStarted({
      stt_provider_id: 'browser-web-speech-api',
    })
    analytics.trackMicrophonePermissionDenied({
      error_code: 'permission_denied',
      stt_provider_id: 'browser-web-speech-api',
    })
    analytics.trackVoiceInputCancelled({
      duration_ms: 420,
      stt_provider_id: 'browser-web-speech-api',
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'voice_input_started', {
      app_surface: 'web',
      stt_provider_id: 'browser-web-speech-api',
      trigger_method: 'voice',
      trigger_type: 'user_action',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'microphone_permission_denied', {
      app_surface: 'web',
      error_code: 'permission_denied',
      stt_provider_id: 'browser-web-speech-api',
      trigger_method: 'voice',
      trigger_type: 'user_flow_result',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(3, 'voice_input_cancelled', {
      app_surface: 'web',
      duration_ms: 420,
      stt_provider_id: 'browser-web-speech-api',
      trigger_method: 'voice',
      trigger_type: 'user_flow_result',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenCalledTimes(3)
  })

  /**
   * @example
   * analytics.trackProviderConnectionTestCompleted({ provider_id: 'openai-compatible', provider_mode: 'custom', success: false, error_code: 'validation_failed', duration_ms: 32 })
   * expect(posthog.capture).toHaveBeenCalledWith('provider_connection_test_completed', expect.objectContaining({ error_code: 'validation_failed' }))
   */
  it('emits one manual provider test action and one result', () => {
    const analytics = useAnalytics()

    analytics.trackProviderConnectionTestStarted({
      provider_id: 'official-provider',
      provider_mode: 'official',
    })
    analytics.trackProviderConnectionTestCompleted({
      duration_ms: 18,
      provider_id: 'official-provider',
      provider_mode: 'official',
      success: true,
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'provider_connection_test_started', {
      app_surface: 'web',
      provider_id: 'official-provider',
      provider_mode: 'official',
      trigger_method: 'button',
      trigger_type: 'user_action',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'provider_connection_test_completed', {
      app_surface: 'web',
      duration_ms: 18,
      provider_id: 'official-provider',
      provider_mode: 'official',
      success: true,
      trigger_method: 'button',
      trigger_type: 'user_flow_result',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenCalledTimes(2)
  })

  it('marks provider and model selections as explicit user actions', () => {
    const analytics = useAnalytics()

    analytics.trackProviderClick('official-provider', 'consciousness')
    analytics.trackModelSwitched('none', 'model-b')

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'provider_card_clicked', {
      app_surface: 'web',
      module: 'consciousness',
      provider_id: 'official-provider',
      trigger_method: 'provider_card',
      trigger_type: 'user_action',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'model_switched', {
      app_surface: 'web',
      from_model: 'none',
      reason: 'manual',
      to_model: 'model-b',
      trigger_method: 'selection',
      trigger_type: 'user_action',
    })
  })

  it('emits P0 onboarding, message, quota, and feature events using canonical names', () => {
    const analytics = useAnalytics()

    analytics.trackOnboardingStarted({
      entry: 'app_start',
    })
    analytics.trackOnboardingCompleted({
      selected_provider_id: 'official-provider',
      selected_provider_type: 'official',
      selected_use_case: 'role_chat',
    })
    analytics.trackMessageSent({
      conversation_id: 'session-1',
      has_attachment: false,
      message_id: 'message-1',
      message_index: 2,
      message_length: 24,
      mode: 'text',
      model: 'gpt-test',
      provider_name: 'official-provider',
      provider_type: 'official',
      round_id: 'message-1',
      turn_index: 1,
    })
    analytics.trackQuotaLimitReached({
      current_usage: 0,
      entry: 'pricing',
      limit_type: 'flux',
      limit_value: 0,
    })
    analytics.trackUpgradeClicked({
      current_plan: 'flux',
      source_page: 'settings_flux',
      trigger: 'manual_topup',
    })
    analytics.trackFeatureUsed({
      business_domain: 'conversation',
      entry: 'chat',
      feature_name: 'chat',
      success: true,
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'onboarding_started', {
      app_surface: 'web',
      entry: 'app_start',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'onboarding_completed', {
      app_surface: 'web',
      selected_provider_id: 'official-provider',
      selected_provider_type: 'official',
      selected_use_case: 'role_chat',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(3, 'message_sent', {
      app_surface: 'web',
      conversation_id: 'session-1',
      has_attachment: false,
      message_id: 'message-1',
      message_index: 2,
      message_length: 24,
      mode: 'text',
      model: 'gpt-test',
      provider_name: 'official-provider',
      provider_type: 'official',
      round_id: 'message-1',
      trigger_method: 'text_input',
      trigger_type: 'user_action',
      turn_index: 1,
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(4, 'quota_limit_reached', {
      current_usage: 0,
      entry: 'pricing',
      limit_type: 'flux',
      limit_value: 0,
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(5, 'upgrade_clicked', {
      current_plan: 'flux',
      source_page: 'settings_flux',
      trigger: 'manual_topup',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(6, 'feature_used', {
      app_surface: 'web',
      business_domain: 'conversation',
      entry: 'chat',
      feature_name: 'chat',
      success: true,
    })
  })

  it('emits P1 conversation, attachment, preset, settings, and support events', () => {
    const analytics = useAnalytics()

    analytics.trackConversationCreated({
      character_id: 'character-1',
      cloud_synced: true,
      conversation_id: 'session-1',
      source: 'new_session',
    })
    analytics.trackConversationRenamed({
      conversation_id: 'session-1',
      source: 'sessions_drawer',
    })
    analytics.trackConversationShared({
      conversation_id: 'session-1',
      source: 'share_button',
    })
    analytics.trackConversationDeleted({
      cloud_synced: true,
      conversation_id: 'session-1',
      message_count: 6,
    })
    analytics.trackAttachmentUploaded({
      attachment_type: 'image',
      size_bytes: 2048,
      source: 'chat',
      success: true,
    })
    analytics.trackPresetUsed({
      preset_id: 'preset-live2d-1',
      preset_type: 'stage_model',
      source: 'settings',
    })
    analytics.trackSettingsChanged({
      new_value: true,
      previous_value: false,
      setting_name: 'analytics_enabled',
      source: 'settings',
    })
    analytics.trackSupportContacted({
      category: 'payment',
      channel: 'discord',
      source: 'settings',
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'conversation_created', {
      app_surface: 'web',
      character_id: 'character-1',
      cloud_synced: true,
      conversation_id: 'session-1',
      source: 'new_session',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'conversation_renamed', {
      app_surface: 'web',
      conversation_id: 'session-1',
      source: 'sessions_drawer',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(3, 'conversation_shared', {
      app_surface: 'web',
      conversation_id: 'session-1',
      source: 'share_button',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(4, 'conversation_deleted', {
      app_surface: 'web',
      cloud_synced: true,
      conversation_id: 'session-1',
      message_count: 6,
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(5, 'attachment_uploaded', {
      app_surface: 'web',
      attachment_type: 'image',
      size_bytes: 2048,
      source: 'chat',
      success: true,
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(6, 'preset_used', {
      app_surface: 'web',
      preset_id: 'preset-live2d-1',
      preset_type: 'stage_model',
      source: 'settings',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(7, 'settings_changed', {
      app_surface: 'web',
      new_value: true,
      previous_value: false,
      setting_name: 'analytics_enabled',
      source: 'settings',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(8, 'support_contacted', {
      app_surface: 'web',
      category: 'payment',
      channel: 'discord',
      source: 'settings',
    })
  })

  /**
   * @example
   * analytics.trackBugReportSubmitted({ source: 'app', category: 'update', severity: 'major', user_type: 'unknown', entrypoint: 'about_update_error', description_length_bucket: 'medium', include_triage_context: true, screenshot_attached: true })
   * expect(posthog.capture).toHaveBeenCalledWith('bug_report_submitted', expect.objectContaining({ category: 'update' }))
   */
  it('emits feedback and bug report events with community triage tags', () => {
    const analytics = useAnalytics()

    analytics.trackBugReportSubmitted({
      category: 'update',
      description_length_bucket: 'medium',
      entrypoint: 'about_update_error',
      include_triage_context: true,
      screenshot_attached: true,
      severity: 'major',
      source: 'app',
      user_type: 'unknown',
    })
    analytics.trackFeedbackSubmitted({
      category: 'voice_input',
      entrypoint: 'community_manual_tag',
      severity: 'minor',
      source: 'discord',
      user_type: 'new_user',
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'bug_report_submitted', {
      app_surface: 'web',
      category: 'update',
      description_length_bucket: 'medium',
      entrypoint: 'about_update_error',
      include_triage_context: true,
      screenshot_attached: true,
      severity: 'major',
      source: 'app',
      user_type: 'unknown',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'feedback_submitted', {
      app_surface: 'web',
      category: 'voice_input',
      entrypoint: 'community_manual_tag',
      severity: 'minor',
      source: 'discord',
      user_type: 'new_user',
    })
  })

  it('emits account lifecycle events shared with the ui-server-auth surface', () => {
    const analytics = useAnalytics()

    analytics.trackPasswordChanged()
    analytics.trackPasswordResetRequested()
    analytics.trackOauthProviderLinkStarted({ provider: 'github' })
    analytics.trackOauthProviderUnlinked({ provider: 'google' })
    analytics.trackAccountDeletionRequested()
    analytics.trackOauthCallbackFailed({ stage: 'missing_flow_state' })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'password_changed', { app_surface: 'web' })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'password_reset_requested', { app_surface: 'web' })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(
      3,
      'oauth_provider_link_started',
      { app_surface: 'web', provider: 'github' },
      { beforeNavigation: true },
    )
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(4, 'oauth_provider_unlinked', {
      app_surface: 'web',
      provider: 'google',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(5, 'account_deletion_requested', { app_surface: 'web' })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(6, 'oauth_callback_failed', {
      app_surface: 'web',
      stage: 'missing_flow_state',
    })
  })

  it('emits AIRI card edit and scene background events', () => {
    const analytics = useAnalytics()

    analytics.trackCardEdited({ card_id: 'card-1' })
    analytics.trackSceneBackgroundSet({ cleared: false, source: 'card_gallery' })
    analytics.trackSceneBackgroundSet({ cleared: true, source: 'scene_settings' })
    analytics.trackCharacterUpdated({ character_id: 'character-1' })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'card_edited', {
      app_surface: 'web',
      card_id: 'card-1',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'scene_background_set', {
      app_surface: 'web',
      cleared: false,
      source: 'card_gallery',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(3, 'scene_background_set', {
      app_surface: 'web',
      cleared: true,
      source: 'scene_settings',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(4, 'character_updated', {
      character_id: 'character-1',
    })
  })

  it('emits data maintenance actions as one event with an action discriminator', () => {
    const analytics = useAnalytics()

    analytics.trackDataAction({ action: 'chats_exported' })
    analytics.trackDataAction({ action: 'app_data_cleared' })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'data_action', {
      action: 'chats_exported',
      app_surface: 'web',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'data_action', {
      action: 'app_data_cleared',
      app_surface: 'web',
    })
  })

  it('emits stable controls-island actions and flushes reload actions immediately', () => {
    analyticsMocks.isStageTamagotchiMock.mockReturnValue(true)
    const analytics = useAnalytics()

    analytics.trackControlsIslandAction({ action: 'toggle_chat' })
    analytics.trackControlsIslandAction({ action: 'refresh_window' })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'controls_island_action', {
      action: 'toggle_chat',
      environment: 'tamagotchi',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(
      2,
      'controls_island_action',
      {
        action: 'refresh_window',
        environment: 'tamagotchi',
      },
      { beforeNavigation: true },
    )
  })

  it('emits desktop differentiator events for spotlight, widgets, updater, MCP, and pairing', () => {
    analyticsMocks.isStageTamagotchiMock.mockReturnValue(true)
    const analytics = useAnalytics()

    analytics.trackSpotlightUsed()
    analytics.trackWidgetOpened({ widget_id: 'weather' })
    analytics.trackUpdateCheckClicked({ channel: 'auto' })
    analytics.trackUpdateDownloaded({ channel: 'stable', version: '0.11.0' })
    analytics.trackUpdateInstallClicked({ channel: 'stable', version: '0.11.0' })
    analytics.trackMcpServerAdded()
    analytics.trackMcpServerRemoved()
    analytics.trackMcpConnectionTestRun({ success: false })
    analytics.trackDevicePairingQrShown()

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'spotlight_used', {})
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'widget_opened', { widget_id: 'weather' })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(3, 'update_check_clicked', { channel: 'auto' })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(4, 'update_downloaded', { channel: 'stable', version: '0.11.0' })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(
      5,
      'update_install_clicked',
      { channel: 'stable', version: '0.11.0' },
      { beforeNavigation: true },
    )
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(6, 'mcp_server_updated', { action: 'add' })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(7, 'mcp_server_updated', { action: 'remove' })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(8, 'mcp_connection_test_run', { success: false })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(9, 'device_pairing_qr_shown', {})
  })
})
