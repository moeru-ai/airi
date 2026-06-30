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
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(2, 'microphone_permission_requested', {
      surface: 'web',
      stt_provider_id: 'browser-web-speech-api',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(3, 'microphone_permission_denied', {
      surface: 'web',
      stt_provider_id: 'browser-web-speech-api',
      error_code: 'permission_denied',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(4, 'audio_device_unavailable', {
      surface: 'web',
      stt_provider_id: 'browser-web-speech-api',
      error_code: 'device_unavailable',
    })
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(5, 'voice_input_cancelled', {
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
    expect(analyticsMocks.posthogCaptureMock).toHaveBeenNthCalledWith(3, 'provider_config_failed', {
      surface: 'web',
      provider_id: 'openai-compatible',
      provider_mode: 'custom',
      step: 'settings_auto_validate',
      error_code: 'validation_failed',
      duration_ms: 32,
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
})
