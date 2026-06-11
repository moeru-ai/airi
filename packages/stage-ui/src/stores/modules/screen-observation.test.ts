import { describe, expect, it } from 'vitest'

import { privacyStateLabelKey, provisionalPrivacyState } from './screen-observation'

const now = new Date('2026-06-11T12:00:00.000Z')

describe('provisionalPrivacyState', () => {
  it('reports disabled while the master switch is off, regardless of whitelist', () => {
    expect(provisionalPrivacyState({ enabled: false, allowedApps: [], now })).toBe('disabled')
    expect(provisionalPrivacyState({ enabled: false, allowedApps: ['obsidian'], now })).toBe('disabled')
  })

  it('treats an enabled switch with an empty whitelist as the explicit not-observing dead-state', () => {
    expect(provisionalPrivacyState({ enabled: true, allowedApps: [], now })).toBe('not_observing_empty_whitelist')
  })

  it('reports paused only while pauseUntil is in the future', () => {
    expect(provisionalPrivacyState({
      enabled: true,
      allowedApps: ['obsidian'],
      pauseUntil: '2026-06-11T13:00:00.000Z',
      now,
    })).toBe('paused')
    expect(provisionalPrivacyState({
      enabled: true,
      allowedApps: ['obsidian'],
      pauseUntil: '2026-06-11T11:00:00.000Z',
      now,
    })).toBe('observing')
  })

  it('reports observing when enabled with a non-empty whitelist and no pause', () => {
    expect(provisionalPrivacyState({ enabled: true, allowedApps: ['obsidian'], now })).toBe('observing')
  })
})

describe('privacyStateLabelKey', () => {
  it('maps every state to a kebab-case i18n key', () => {
    expect(privacyStateLabelKey('observing')).toBe('settings.pages.modules.screen-observation.status.observing')
    expect(privacyStateLabelKey('not_observing_empty_whitelist')).toBe('settings.pages.modules.screen-observation.status.not-observing-empty-whitelist')
    expect(privacyStateLabelKey('suppressed_fullscreen')).toBe('settings.pages.modules.screen-observation.status.suppressed-fullscreen')
  })
})
