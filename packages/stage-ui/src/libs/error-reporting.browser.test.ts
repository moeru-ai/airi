import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'

import { useSettingsAnalytics } from '../stores/settings/analytics'
import { createErrorReportingConsentFilter } from './error-reporting'

afterEach(() => {
  localStorage.clear()
})

describe('createErrorReportingConsentFilter', () => {
  it('sends a report only while analytics is on, and applies a change to the next report', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const filter = createErrorReportingConsentFilter(pinia)
    const event = { message: 'boom' }

    expect(filter(event)).toBe(event)

    useSettingsAnalytics(pinia).analyticsEnabled = false
    expect(filter(event)).toBeNull()

    useSettingsAnalytics(pinia).analyticsEnabled = true
    expect(filter(event)).toBe(event)
  })

  it('reads a stored opt-out before the store exists', () => {
    localStorage.setItem('settings/analytics/enabled', 'false')
    const pinia = createPinia()

    expect(createErrorReportingConsentFilter(pinia)({ message: 'boom' })).toBeNull()
  })
})
