import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { expect, it, vi } from 'vitest'

import { useSettingsAnalytics } from '../../../stores/settings/analytics'
import { configureAnalyticsAdapter, disableAnalyticsCapture } from '../client'
import { captureFeatureFlagEvent } from './feature-flags'

it('captures feature decisions only with analytics consent and build support', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const capture = vi.fn(() => true)
  vi.stubEnv('VITE_ENABLE_ANALYTICS', 'true')
  configureAnalyticsAdapter(async () => ({
    capture,
    getIdentitySnapshot: () => null,
    identify: vi.fn(),
    registerBuildInfo: vi.fn(),
    resetIdentity: vi.fn(),
    setCaptureEnabled: enabled => enabled,
  }))
  const settings = useSettingsAnalytics()
  const previousConsent = settings.analyticsEnabled
  const decision = { enabled: false, source: 'account', selectable: false } as const

  try {
    settings.analyticsEnabled = false
    expect(captureFeatureFlagEvent('feature_flag_exposed', 'test-feature', decision)).toBe(false)
    expect(capture).not.toHaveBeenCalled()

    settings.analyticsEnabled = true
    expect(captureFeatureFlagEvent('feature_flag_changed', 'test-feature', decision, null)).toBe(true)
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(1))
    expect(capture).toHaveBeenCalledWith('feature_flag_changed', {
      feature_key: 'test-feature',
      enabled: false,
      source: 'account',
      environment: 'web',
      preference: null,
    }, undefined)

    vi.stubEnv('VITE_ENABLE_ANALYTICS', 'false')
    expect(captureFeatureFlagEvent('feature_flag_exposed', 'test-feature', decision)).toBe(false)
    expect(capture).toHaveBeenCalledTimes(1)
  }
  finally {
    vi.stubEnv('VITE_ENABLE_ANALYTICS', 'true')
    disableAnalyticsCapture()
    settings.analyticsEnabled = previousConsent
    vi.unstubAllEnvs()
    disposePinia(pinia)
  }
})
