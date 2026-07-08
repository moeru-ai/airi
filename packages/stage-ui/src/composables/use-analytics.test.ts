import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useAnalytics } from './use-analytics'

const analyticsMocks = vi.hoisted(() => ({
  ensurePosthogInitializedMock: vi.fn(() => true),
  isStageCapacitorMock: vi.fn(() => false),
  isStageTamagotchiMock: vi.fn(() => false),
  isPosthogAvailableInBuildMock: vi.fn(() => true),
  markFirstMessageTrackedMock: vi.fn(),
  posthogCaptureMock: vi.fn(),
}))

vi.mock('@proj-airi/stage-shared', () => ({
  isStageCapacitor: analyticsMocks.isStageCapacitorMock,
  isStageTamagotchi: analyticsMocks.isStageTamagotchiMock,
}))

vi.mock('posthog-js', () => ({
  default: {
    capture: analyticsMocks.posthogCaptureMock,
  },
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: ref('en'),
  }),
}))

vi.mock('../stores/analytics', () => ({
  useSharedAnalyticsStore: () => ({
    appStartTime: null,
    firstMessageTracked: false,
    markFirstMessageTracked: analyticsMocks.markFirstMessageTrackedMock,
  }),
}))

vi.mock('../stores/analytics/posthog', () => ({
  ensurePosthogInitialized: analyticsMocks.ensurePosthogInitializedMock,
  isPosthogAvailableInBuild: analyticsMocks.isPosthogAvailableInBuildMock,
}))

vi.mock('../stores/analytics/privacy-policy', () => ({
  getAnalyticsPrivacyPolicyUrl: () => 'https://example.com/privacy',
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
    analyticsMocks.markFirstMessageTrackedMock.mockClear()
    analyticsMocks.ensurePosthogInitializedMock.mockClear()
    analyticsMocks.isStageCapacitorMock.mockReset()
    analyticsMocks.isStageTamagotchiMock.mockReset()
    analyticsMocks.isStageCapacitorMock.mockReturnValue(false)
    analyticsMocks.isStageTamagotchiMock.mockReturnValue(false)
    analyticsMocks.isPosthogAvailableInBuildMock.mockClear()
  })

  it('infers the web surface for browser conversation actions', () => {
    const analytics = useAnalytics()

    analytics.trackTtsStopClicked({
      reason: 'manual-chat',
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenCalledWith('tts_stop_clicked', {
      surface: 'web',
      reason: 'manual-chat',
    })
  })

  it('infers the mobile surface for capacitor conversation actions', () => {
    analyticsMocks.isStageCapacitorMock.mockReturnValue(true)
    const analytics = useAnalytics()

    analytics.trackChatSessionSelected({
      source: 'sessions_drawer',
      message_count: 4,
      cloud_synced: true,
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenCalledWith('chat_session_selected', {
      surface: 'mobile',
      source: 'sessions_drawer',
      message_count: 4,
      cloud_synced: true,
    })
  })

  it('infers the electron surface for destructive and recovery chat message actions', () => {
    analyticsMocks.isStageTamagotchiMock.mockReturnValue(true)
    const analytics = useAnalytics()

    analytics.trackChatMessageDeleted({
      source: 'history',
      message_role: 'assistant',
    })
    analytics.trackChatMessagesCleared({
      source: 'chat_controls',
      message_count: 3,
    })
    analytics.trackChatMessageRetried({
      source: 'history',
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'chat_message_deleted', {
      surface: 'electron',
      source: 'history',
      message_role: 'assistant',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'chat_messages_cleared', {
      surface: 'electron',
      source: 'chat_controls',
      message_count: 3,
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(3, 'chat_message_retried', {
      surface: 'electron',
      source: 'history',
    })
  })

  /**
   * @example
   * analytics.trackChatActivationStarted({ provider_mode: 'official', provider_id: 'official-provider', model_id: 'gpt-test', source: 'text' })
   * expect(posthog.capture).toHaveBeenCalledWith('chat_activation_started', expect.objectContaining({ surface: 'web' }))
   */
  it('emits chat activation milestones with inferred surface and normalized fields', () => {
    const analytics = useAnalytics()

    analytics.trackChatActivationStarted({
      provider_mode: 'official',
      provider_id: 'official-provider',
      model_id: 'gpt-test',
      source: 'text',
    })
    analytics.trackChatActivationSucceeded({
      provider_mode: 'official',
      provider_id: 'official-provider',
      model_id: 'gpt-test',
      time_to_first_message_ms: 1200,
      source: 'voice',
    })
    analytics.trackChatActivationFailed({
      provider_mode: 'custom',
      provider_id: 'openai-compatible',
      model_id: 'custom',
      error_code: 'provider_error',
      failure_stage: 'llm_response',
      source: 'voice',
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'chat_activation_started', {
      surface: 'web',
      provider_mode: 'official',
      provider_id: 'official-provider',
      model_id: 'gpt-test',
      source: 'text',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'chat_activation_succeeded', {
      surface: 'web',
      provider_mode: 'official',
      provider_id: 'official-provider',
      model_id: 'gpt-test',
      time_to_first_message_ms: 1200,
      source: 'voice',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(3, 'chat_activation_failed', {
      surface: 'web',
      provider_mode: 'custom',
      provider_id: 'openai-compatible',
      model_id: 'custom',
      error_code: 'provider_error',
      failure_stage: 'llm_response',
      source: 'voice',
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
      tts_provider_id: 'official-provider',
      tts_model_id: 'stepfun/tts',
      source: 'settings',
    })
    analytics.trackVoiceSelected({
      tts_provider_id: 'official-provider',
      tts_model_id: 'stepfun/tts',
      voice_id: 'longxiaochun_v2',
      voice_type: 'official_selected',
      source: 'settings',
    })
    analytics.trackVoicePreviewPlayed({
      tts_provider_id: 'official-provider',
      tts_model_id: 'stepfun/tts',
      voice_id: 'longxiaochun_v2',
      voice_type: 'official_selected',
      source: 'manual_preview',
    })
    analytics.trackVoicePackBound({
      tts_provider_id: 'official-provider',
      tts_model_id: 'stepfun/tts',
      voice_id: 'longxiaochun_v2',
      voice_pack_id: 'pack-1',
      source: 'settings',
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'tts_provider_selected', {
      surface: 'web',
      tts_provider_id: 'official-provider',
      tts_model_id: 'stepfun/tts',
      source: 'settings',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'voice_selected', {
      surface: 'web',
      tts_provider_id: 'official-provider',
      tts_model_id: 'stepfun/tts',
      voice_id: 'longxiaochun_v2',
      voice_type: 'official_selected',
      source: 'settings',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(3, 'voice_preview_played', {
      surface: 'web',
      tts_provider_id: 'official-provider',
      tts_model_id: 'stepfun/tts',
      voice_id: 'longxiaochun_v2',
      voice_type: 'official_selected',
      source: 'manual_preview',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(4, 'voice_pack_bound', {
      surface: 'web',
      tts_provider_id: 'official-provider',
      tts_model_id: 'stepfun/tts',
      voice_id: 'longxiaochun_v2',
      voice_pack_id: 'pack-1',
      source: 'settings',
    })
  })

  /**
   * @example
   * analytics.trackOfficialProviderSelected({ provider_id: 'official-provider', provider_mode: 'official', source: 'default_auto', auto_selected: true })
   * expect(posthog.capture).toHaveBeenCalledWith('official_provider_selected', expect.objectContaining({ auto_selected: true }))
   */
  it('emits official provider and second-turn operating events with bounded fields', () => {
    const analytics = useAnalytics()

    analytics.trackOfficialProviderSelected({
      provider_id: 'official-provider',
      provider_mode: 'official',
      source: 'default_auto',
      auto_selected: true,
      model_id: 'chat-auto',
    })
    analytics.trackSecondTurnStarted({
      provider_id: 'official-provider',
      provider_mode: 'official',
      model_id: 'chat-auto',
      source: 'text',
      turn_index: 2,
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'official_provider_selected', {
      surface: 'web',
      provider_id: 'official-provider',
      provider_mode: 'official',
      source: 'default_auto',
      auto_selected: true,
      model_id: 'chat-auto',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'second_turn_started', {
      surface: 'web',
      provider_id: 'official-provider',
      provider_mode: 'official',
      model_id: 'chat-auto',
      source: 'text',
      turn_index: 2,
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
      tts_provider_id: 'official-provider-speech',
      tts_model_id: 'stepfun/tts',
      source: 'post_first_chat',
    })
    analytics.trackOfficialTtsPreviewStarted({
      tts_provider_id: 'official-provider-speech',
      tts_model_id: 'stepfun/tts',
      voice_id: 'longxiaochun_v2',
      voice_type: 'official_selected',
      source: 'manual_preview',
    })
    analytics.trackOfficialTtsPreviewSucceeded({
      tts_provider_id: 'official-provider-speech',
      tts_model_id: 'stepfun/tts',
      voice_id: 'longxiaochun_v2',
      voice_type: 'official_selected',
      source: 'manual_preview',
      duration_ms: 320,
    })
    analytics.trackOfficialTtsAutoEnabled({
      tts_provider_id: 'official-provider-speech',
      tts_model_id: 'stepfun/tts',
      source: 'settings',
      enabled: true,
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'official_tts_exposed', {
      surface: 'web',
      tts_provider_id: 'official-provider-speech',
      tts_model_id: 'stepfun/tts',
      source: 'post_first_chat',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'official_tts_preview_started', {
      surface: 'web',
      tts_provider_id: 'official-provider-speech',
      tts_model_id: 'stepfun/tts',
      voice_id: 'longxiaochun_v2',
      voice_type: 'official_selected',
      source: 'manual_preview',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(3, 'official_tts_preview_succeeded', {
      surface: 'web',
      tts_provider_id: 'official-provider-speech',
      tts_model_id: 'stepfun/tts',
      voice_id: 'longxiaochun_v2',
      voice_type: 'official_selected',
      source: 'manual_preview',
      duration_ms: 320,
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(4, 'official_tts_auto_enabled', {
      surface: 'web',
      tts_provider_id: 'official-provider-speech',
      tts_model_id: 'stepfun/tts',
      source: 'settings',
      enabled: true,
    })
  })

  it('emits paywall exposure with balance bucket for monetization funnels', () => {
    const analytics = useAnalytics()

    analytics.trackPaywallSeen({
      surface: 'settings_flux',
      reason: 'manual_topup',
      flux_balance_bucket: '1_100',
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenCalledWith('paywall_seen', {
      surface: 'settings_flux',
      app_surface: 'web',
      reason: 'manual_topup',
      flux_balance_bucket: '1_100',
    })
  })

  /**
   * @example
   * analytics.trackMicrophonePermissionDenied({ stt_provider_id: 'browser-web-speech-api' })
   * expect(posthog.capture).toHaveBeenCalledWith('microphone_permission_denied', expect.objectContaining({ surface: 'web' }))
   */
  it('emits voice input friction events with low-cardinality error fields', () => {
    const analytics = useAnalytics()

    analytics.trackVoiceInputStarted({
      stt_provider_id: 'browser-web-speech-api',
    })
    analytics.trackMicrophonePermissionRequested({
      stt_provider_id: 'browser-web-speech-api',
    })
    analytics.trackMicrophonePermissionDenied({
      stt_provider_id: 'browser-web-speech-api',
      error_code: 'permission_denied',
    })
    analytics.trackAudioDeviceUnavailable({
      stt_provider_id: 'browser-web-speech-api',
      error_code: 'device_unavailable',
    })
    analytics.trackVoiceInputCancelled({
      stt_provider_id: 'browser-web-speech-api',
      duration_ms: 420,
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'voice_input_started', {
      surface: 'web',
      stt_provider_id: 'browser-web-speech-api',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'voice_input_used', {
      surface: 'web',
      stt_provider_id: 'browser-web-speech-api',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(3, 'microphone_permission_requested', {
      surface: 'web',
      stt_provider_id: 'browser-web-speech-api',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(4, 'microphone_permission_denied', {
      surface: 'web',
      stt_provider_id: 'browser-web-speech-api',
      error_code: 'permission_denied',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(5, 'audio_device_unavailable', {
      surface: 'web',
      stt_provider_id: 'browser-web-speech-api',
      error_code: 'device_unavailable',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(6, 'voice_input_cancelled', {
      surface: 'web',
      stt_provider_id: 'browser-web-speech-api',
      duration_ms: 420,
    })
  })

  /**
   * @example
   * analytics.trackModelListLoaded({ provider_id: 'official-provider', provider_mode: 'official', model_count: 3, duration_ms: 25 })
   * expect(posthog.capture).toHaveBeenCalledWith('model_list_loaded', expect.objectContaining({ provider_id: 'official-provider' }))
   */
  it('emits provider model-list health events', () => {
    const analytics = useAnalytics()

    analytics.trackModelListLoaded({
      provider_id: 'official-provider',
      provider_mode: 'official',
      model_count: 3,
      duration_ms: 25,
    })
    analytics.trackModelListFailed({
      provider_id: 'openai-compatible',
      provider_mode: 'custom',
      error_code: 'provider_error',
      duration_ms: 40,
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'model_list_loaded', {
      surface: 'web',
      provider_id: 'official-provider',
      provider_mode: 'official',
      model_count: 3,
      duration_ms: 25,
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'model_list_failed', {
      surface: 'web',
      provider_id: 'openai-compatible',
      provider_mode: 'custom',
      error_code: 'provider_error',
      duration_ms: 40,
    })
  })

  /**
   * @example
   * analytics.trackProviderConfigFailed({ provider_id: 'openai-compatible', provider_mode: 'custom', step: 'settings_auto_validate', error_code: 'validation_failed', duration_ms: 32 })
   * expect(posthog.capture).toHaveBeenCalledWith('provider_config_failed', expect.objectContaining({ error_code: 'validation_failed' }))
   */
  it('emits provider configuration health events with bounded fields', () => {
    const analytics = useAnalytics()

    analytics.trackProviderConfigStarted({
      provider_id: 'openai-compatible',
      provider_mode: 'custom',
      step: 'settings_auto_validate',
    })
    analytics.trackProviderConfigSucceeded({
      provider_id: 'official-provider',
      provider_mode: 'official',
      step: 'manual_chat_ping',
      duration_ms: 18,
    })
    analytics.trackProviderConfigFailed({
      provider_id: 'openai-compatible',
      provider_mode: 'custom',
      step: 'settings_auto_validate',
      error_code: 'validation_failed',
      duration_ms: 32,
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'provider_config_started', {
      surface: 'web',
      provider_id: 'openai-compatible',
      provider_mode: 'custom',
      step: 'settings_auto_validate',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'provider_config_succeeded', {
      surface: 'web',
      provider_id: 'official-provider',
      provider_mode: 'official',
      step: 'manual_chat_ping',
      duration_ms: 18,
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(3, 'provider_config_completed', {
      surface: 'web',
      provider_id: 'official-provider',
      provider_mode: 'official',
      provider_type: 'official',
      provider_name: 'official-provider',
      entry_page: 'manual_chat_ping',
      step: 'manual_chat_ping',
      duration_ms: 18,
      success: true,
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(4, 'official_provider_enabled', {
      surface: 'web',
      provider_name: 'official-provider',
      entry: 'settings',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(5, 'provider_config_failed', {
      surface: 'web',
      provider_id: 'openai-compatible',
      provider_mode: 'custom',
      step: 'settings_auto_validate',
      error_code: 'validation_failed',
      duration_ms: 32,
    })
  })

  it('emits P0 activation, chat, quota, and feature events using canonical names', () => {
    const analytics = useAnalytics()

    analytics.trackSignupCompleted({
      source: 'google',
      locale: 'en',
      utm_source: 'launch',
    })
    analytics.trackOnboardingStarted({
      entry: 'app_start',
    })
    analytics.trackOnboardingCompleted({
      selected_provider_type: 'official',
      selected_provider_id: 'official-provider',
      selected_use_case: 'role_chat',
    })
    analytics.trackChatStarted({
      conversation_id: 'session-1',
      provider_type: 'official',
      provider_name: 'official-provider',
      model: 'gpt-test',
      entry: 'chat',
      is_paid_user: true,
    })
    analytics.trackMessageSent({
      conversation_id: 'session-1',
      provider_type: 'official',
      provider_name: 'official-provider',
      model: 'gpt-test',
      message_id: 'message-1',
      message_index: 2,
      message_length: 24,
      has_attachment: false,
      mode: 'text',
    })
    analytics.trackAssistantResponseCompleted({
      conversation_id: 'session-1',
      provider_type: 'official',
      provider_name: 'official-provider',
      model: 'gpt-test',
      latency_ms: 350,
      completion_length: 120,
    })
    analytics.trackChatFailed({
      conversation_id: 'session-1',
      provider_type: 'custom',
      provider_name: 'openai-compatible',
      model: 'custom',
      failure_stage: 'llm_response',
      error_code: 'provider_error',
    })
    analytics.trackQuotaLimitReached({
      limit_type: 'flux',
      current_usage: 0,
      limit_value: 0,
      entry: 'pricing',
    })
    analytics.trackUpgradeClicked({
      source_page: 'settings_flux',
      current_plan: 'flux',
      trigger: 'manual_topup',
    })
    analytics.trackFeatureUsed({
      feature_name: 'chat',
      business_domain: 'conversation',
      entry: 'chat',
      success: true,
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'signup_completed', {
      source: 'google',
      locale: 'en',
      utm_source: 'launch',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'onboarding_started', {
      surface: 'web',
      entry: 'app_start',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(3, 'onboarding_completed', {
      surface: 'web',
      selected_provider_type: 'official',
      selected_provider_id: 'official-provider',
      selected_use_case: 'role_chat',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(4, 'chat_started', {
      surface: 'web',
      conversation_id: 'session-1',
      provider_type: 'official',
      provider_name: 'official-provider',
      model: 'gpt-test',
      entry: 'chat',
      is_paid_user: true,
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(5, 'message_sent', {
      surface: 'web',
      conversation_id: 'session-1',
      provider_type: 'official',
      provider_name: 'official-provider',
      model: 'gpt-test',
      message_id: 'message-1',
      message_index: 2,
      message_length: 24,
      has_attachment: false,
      mode: 'text',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(6, 'assistant_response_completed', {
      surface: 'web',
      conversation_id: 'session-1',
      provider_type: 'official',
      provider_name: 'official-provider',
      model: 'gpt-test',
      latency_ms: 350,
      completion_length: 120,
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(7, 'chat_failed', {
      surface: 'web',
      conversation_id: 'session-1',
      provider_type: 'custom',
      provider_name: 'openai-compatible',
      model: 'custom',
      failure_stage: 'llm_response',
      error_code: 'provider_error',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(8, 'quota_limit_reached', {
      limit_type: 'flux',
      current_usage: 0,
      limit_value: 0,
      entry: 'pricing',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(9, 'upgrade_clicked', {
      source_page: 'settings_flux',
      current_plan: 'flux',
      trigger: 'manual_topup',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(10, 'feature_used', {
      surface: 'web',
      feature_name: 'chat',
      business_domain: 'conversation',
      entry: 'chat',
      success: true,
    })
  })

  it('emits P1 conversation, attachment, preset, settings, and support events', () => {
    const analytics = useAnalytics()

    analytics.trackConversationCreated({
      conversation_id: 'session-1',
      source: 'new_session',
      character_id: 'character-1',
      cloud_synced: true,
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
      conversation_id: 'session-1',
      message_count: 6,
      cloud_synced: true,
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
    analytics.trackProviderSwitched({
      from_provider: 'openai-compatible',
      to_provider: 'official-provider',
      from_provider_type: 'custom',
      to_provider_type: 'official',
      reason: 'manual',
    })
    analytics.trackSettingsChanged({
      setting_name: 'analytics_enabled',
      previous_value: false,
      new_value: true,
      source: 'settings',
    })
    analytics.trackSupportContacted({
      channel: 'discord',
      source: 'settings',
      category: 'payment',
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'conversation_created', {
      surface: 'web',
      conversation_id: 'session-1',
      source: 'new_session',
      character_id: 'character-1',
      cloud_synced: true,
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'conversation_renamed', {
      surface: 'web',
      conversation_id: 'session-1',
      source: 'sessions_drawer',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(3, 'conversation_shared', {
      surface: 'web',
      conversation_id: 'session-1',
      source: 'share_button',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(4, 'conversation_deleted', {
      surface: 'web',
      conversation_id: 'session-1',
      message_count: 6,
      cloud_synced: true,
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(5, 'attachment_uploaded', {
      surface: 'web',
      attachment_type: 'image',
      size_bytes: 2048,
      source: 'chat',
      success: true,
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(6, 'preset_used', {
      surface: 'web',
      preset_id: 'preset-live2d-1',
      preset_type: 'stage_model',
      source: 'settings',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(7, 'provider_switched', {
      surface: 'web',
      from_provider: 'openai-compatible',
      to_provider: 'official-provider',
      from_provider_type: 'custom',
      to_provider_type: 'official',
      reason: 'manual',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(8, 'settings_changed', {
      surface: 'web',
      setting_name: 'analytics_enabled',
      previous_value: false,
      new_value: true,
      source: 'settings',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(9, 'support_contacted', {
      surface: 'web',
      channel: 'discord',
      source: 'settings',
      category: 'payment',
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
      source: 'app',
      category: 'update',
      severity: 'major',
      user_type: 'unknown',
      entrypoint: 'about_update_error',
      description_length_bucket: 'medium',
      include_triage_context: true,
      screenshot_attached: true,
    })
    analytics.trackFeedbackSubmitted({
      source: 'discord',
      category: 'voice_input',
      severity: 'minor',
      user_type: 'new_user',
      entrypoint: 'community_manual_tag',
    })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'bug_report_submitted', {
      surface: 'web',
      source: 'app',
      category: 'update',
      severity: 'major',
      user_type: 'unknown',
      entrypoint: 'about_update_error',
      description_length_bucket: 'medium',
      include_triage_context: true,
      screenshot_attached: true,
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'feedback_submitted', {
      surface: 'web',
      source: 'discord',
      category: 'voice_input',
      severity: 'minor',
      user_type: 'new_user',
      entrypoint: 'community_manual_tag',
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

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'password_changed', { surface: 'web' })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'password_reset_requested', { surface: 'web' })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(
      3,
      'oauth_provider_link_started',
      { surface: 'web', provider: 'github' },
      { send_instantly: true, transport: 'sendBeacon' },
    )
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(4, 'oauth_provider_unlinked', {
      surface: 'web',
      provider: 'google',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(5, 'account_deletion_requested', { surface: 'web' })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(6, 'oauth_callback_failed', {
      surface: 'web',
      stage: 'missing_flow_state',
    })
  })

  it('emits AIRI card edit and scene background events', () => {
    const analytics = useAnalytics()

    analytics.trackCardEdited({ card_id: 'card-1' })
    analytics.trackSceneBackgroundSet({ source: 'card_gallery', cleared: false })
    analytics.trackSceneBackgroundSet({ source: 'scene_settings', cleared: true })
    analytics.trackCharacterUpdated({ character_id: 'character-1' })

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'card_edited', {
      surface: 'web',
      card_id: 'card-1',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'scene_background_set', {
      surface: 'web',
      source: 'card_gallery',
      cleared: false,
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(3, 'scene_background_set', {
      surface: 'web',
      source: 'scene_settings',
      cleared: true,
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
      surface: 'web',
      action: 'chats_exported',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'data_action', {
      surface: 'web',
      action: 'app_data_cleared',
    })
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

    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(1, 'spotlight_used')
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'widget_opened', { widget_id: 'weather' })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(3, 'update_check_clicked', { channel: 'auto' })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(4, 'update_downloaded', { channel: 'stable', version: '0.11.0' })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(
      5,
      'update_install_clicked',
      { channel: 'stable', version: '0.11.0' },
      { send_instantly: true, transport: 'sendBeacon' },
    )
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(6, 'mcp_server_added')
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(7, 'mcp_server_removed')
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(8, 'mcp_connection_test_run', { success: false })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(9, 'device_pairing_qr_shown')
  })
})
