import { expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { startAnalyticsRenderer } from './renderer.test-helper'

it('keeps auxiliary window observers without counting another app open', async () => {
  const renderer = startAnalyticsRenderer('auxiliary')
  try {
    renderer.settings.analyticsEnabled = false
    await nextTick()
    await vi.waitFor(() => expect(renderer.capture).toHaveBeenCalledWith('settings_changed', expect.objectContaining({ new_value: false, app_surface: 'desktop' }), undefined))
    expect(renderer.capture.mock.calls.filter(([name]) => name === 'app_opened')).toHaveLength(0)
  }
  finally {
    renderer.dispose()
  }
})
