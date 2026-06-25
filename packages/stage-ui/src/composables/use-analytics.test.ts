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
})
