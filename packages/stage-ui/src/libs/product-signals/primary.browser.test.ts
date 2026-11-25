import { expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { initializeAnalytics } from './index'
import { startAnalyticsRenderer } from './renderer.test-helper'

it('counts the primary desktop runtime once and preserves consent observers', async () => {
  const renderer = startAnalyticsRenderer('primary')
  try {
    await vi.waitFor(() => expect(renderer.capture).toHaveBeenCalledWith('app_opened', expect.objectContaining({ app_surface: 'desktop' }), undefined))
    initializeAnalytics('primary')
    expect(renderer.capture.mock.calls.filter(([name]) => name === 'app_opened')).toHaveLength(1)
    renderer.settings.analyticsEnabled = false
    await nextTick()
    expect(renderer.capture).toHaveBeenCalledWith('settings_changed', expect.objectContaining({ new_value: false, app_surface: 'desktop' }), undefined)
  }
  finally {
    renderer.dispose()
  }
})
