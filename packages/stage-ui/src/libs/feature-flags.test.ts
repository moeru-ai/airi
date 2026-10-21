import type { FeatureFlag } from './feature-flags'

import { parse } from 'valibot'
import { describe, expect, it } from 'vitest'

import { CHARACTER_CARD_SYNC_FLAG, featureFlagResponseSchema, featureFlags, FULLSCREEN_WORKSPACE_FLAG, offeredFeatureFlags, OFFICIAL_RESPONSES_FLAG, resolveFeatureFlag, resolveFeatureVariant } from './feature-flags'

const feature: FeatureFlag = { key: 'test-feature', titleKey: 'test.title', descriptionKey: 'test.description', defaultEnabled: false, availability: 'local' }

describe('feature flag decisions', () => {
  it('allows local choices without a cloud grant or an account', () => {
    expect(resolveFeatureFlag(feature, undefined, undefined, false)).toEqual({ enabled: false, source: 'default', selectable: true })
    expect(resolveFeatureFlag(feature, true, undefined, false)).toEqual({ enabled: true, source: 'local', selectable: true })
  })

  it('ignores cloud policies for local-only flags', () => {
    expect(resolveFeatureFlag(feature, false, { key: feature.key, mode: 'cloud-controlled', source: 'global' }, true).enabled).toBe(false)
  })

  it('hides and disables missing cloud grants despite saved preferences and local defaults', () => {
    expect(resolveFeatureFlag({ ...feature, availability: 'cloud', defaultEnabled: true }, true, undefined, true))
      .toEqual({ enabled: false, source: 'default', selectable: false })
  })

  it('requires an account for opt-in grants and starts disabled', () => {
    const optIn: FeatureFlag = { ...feature, availability: 'cloud' }
    const policy = { key: feature.key, mode: 'cloud-opt-in', source: 'account' } as const
    expect(resolveFeatureFlag(optIn, true, policy, false)).toEqual({ enabled: false, source: 'default', selectable: false })
    expect(resolveFeatureFlag(optIn, undefined, policy, true)).toEqual({ enabled: false, source: 'account', selectable: true })
    expect(resolveFeatureFlag(optIn, true, policy, true)).toEqual({ enabled: true, source: 'local', selectable: true })
    expect(resolveFeatureFlag(optIn, false, policy, true).enabled).toBe(false)
  })

  // Cloud can turn an opt-in flag on for accounts that made no choice. The user can still turn it off or reset it.
  it('starts opt-in grants in the Cloud default state until the user chooses', () => {
    const optIn: FeatureFlag = { ...feature, availability: 'cloud' }
    const policy = { key: feature.key, mode: 'cloud-opt-in', source: 'global', defaultEnabled: true } as const
    expect(resolveFeatureFlag(optIn, undefined, policy, true)).toEqual({ enabled: true, source: 'global', selectable: true })
    expect(resolveFeatureFlag(optIn, false, policy, true)).toEqual({ enabled: false, source: 'local', selectable: true })
    expect(resolveFeatureFlag(optIn, true, { ...policy, defaultEnabled: false }, true)).toEqual({ enabled: true, source: 'local', selectable: true })
    expect(resolveFeatureFlag(optIn, undefined, { ...policy, defaultEnabled: false }, true)).toEqual({ enabled: false, source: 'global', selectable: true })
  })

  it('keeps the Cloud default off for signed-out users', () => {
    const optIn: FeatureFlag = { ...feature, availability: 'cloud' }
    const policy = { key: feature.key, mode: 'cloud-opt-in', source: 'global', defaultEnabled: true } as const
    expect(resolveFeatureFlag(optIn, undefined, policy, false)).toEqual({ enabled: false, source: 'default', selectable: false })
  })

  it('applies cloud control without exposing a toggle or accepting device preferences', () => {
    const controlled: FeatureFlag = { ...feature, availability: 'cloud' }
    const policy = { key: feature.key, mode: 'cloud-controlled', source: 'global' } as const
    expect(resolveFeatureFlag(controlled, false, policy, false)).toEqual({ enabled: true, source: 'global', selectable: false })
    expect(resolveFeatureFlag(controlled, true, undefined, true).enabled).toBe(false)
    expect(resolveFeatureFlag(controlled, undefined, { ...policy, defaultEnabled: false }, true)).toEqual({ enabled: true, source: 'global', selectable: false })
  })

  it('lets Cloud change modes without changing client registration', () => {
    const cloud: FeatureFlag = { ...feature, availability: 'cloud' }
    const optIn = { key: feature.key, mode: 'cloud-opt-in', source: 'account' } as const
    const controlled = { key: feature.key, mode: 'cloud-controlled', source: 'global' } as const
    expect(resolveFeatureFlag(cloud, false, optIn, true)).toEqual({ enabled: false, source: 'local', selectable: true })
    expect(resolveFeatureFlag(cloud, false, controlled, true)).toEqual({ enabled: true, source: 'global', selectable: false })
    expect(resolveFeatureFlag(cloud, false, optIn, true)).toEqual({ enabled: false, source: 'local', selectable: true })
  })

  it('rejects grants for a different flag', () => {
    expect(resolveFeatureFlag({ ...feature, availability: 'cloud' }, true, { key: 'other', mode: 'cloud-controlled', source: 'global' }, true).enabled).toBe(false)
  })

  it('validates cloud modes at the response boundary', () => {
    expect(() => parse(featureFlagResponseSchema, { flags: [{ key: feature.key, mode: 'local', source: 'account' }] })).toThrow()
  })

  it('accepts policies with and without a Cloud default, and rejects a non-boolean default', () => {
    expect(parse(featureFlagResponseSchema, { flags: [{ key: feature.key, mode: 'cloud-opt-in', source: 'global', defaultEnabled: true }] }).flags[0].defaultEnabled).toBe(true)
    expect(parse(featureFlagResponseSchema, { flags: [{ key: feature.key, mode: 'cloud-opt-in', source: 'global' }] }).flags[0].defaultEnabled).toBeUndefined()
    expect(() => parse(featureFlagResponseSchema, { flags: [{ key: feature.key, mode: 'cloud-opt-in', source: 'global', defaultEnabled: 'true' }] })).toThrow()
  })

  // The client registration never turns the Responses preference on. Only a Cloud grant shows the switch.
  it('registers the official Responses preference as a Cloud flag that stays off without a grant', () => {
    expect(featureFlags).toContain(OFFICIAL_RESPONSES_FLAG)
    expect(OFFICIAL_RESPONSES_FLAG.availability).toBe('cloud')
    expect(OFFICIAL_RESPONSES_FLAG.defaultEnabled).toBe(false)
    expect(resolveFeatureFlag(OFFICIAL_RESPONSES_FLAG, undefined, undefined, true)).toEqual({ enabled: false, source: 'default', selectable: false })
  })

  it('registers character card sync as a local, off-by-default choice', () => {
    expect(featureFlags).toContain(CHARACTER_CARD_SYNC_FLAG)
    expect(CHARACTER_CARD_SYNC_FLAG.availability).toBe('local')
    expect(CHARACTER_CARD_SYNC_FLAG.defaultEnabled).toBe(false)
    expect(resolveFeatureFlag(CHARACTER_CARD_SYNC_FLAG, undefined, undefined, true)).toEqual({ enabled: false, source: 'default', selectable: true })
  })

  // The standalone settings window stays the default, so a user opts in to the fullscreen mode.
  it('registers the main window fullscreen mode as a local, off-by-default choice', () => {
    expect(featureFlags).toContain(FULLSCREEN_WORKSPACE_FLAG)
    expect(resolveFeatureFlag(FULLSCREEN_WORKSPACE_FLAG, undefined, undefined, false)).toEqual({ enabled: false, source: 'default', selectable: true })
  })

  // The web and mobile apps have no main window, so their experiments page leaves the mode out.
  it('offers desktop-only experiments only in the desktop app', () => {
    expect(offeredFeatureFlags(true)).toContain(FULLSCREEN_WORKSPACE_FLAG)
    expect(offeredFeatureFlags(false)).not.toContain(FULLSCREEN_WORKSPACE_FLAG)
    expect(offeredFeatureFlags(false)).toContain(CHARACTER_CARD_SYNC_FLAG)
  })

  // A device can keep a choice that a later version no longer offers. The feature then runs its first variant.
  it('resolves the saved variant, and falls back to the first one for a missing or unknown choice', () => {
    expect(resolveFeatureVariant(FULLSCREEN_WORKSPACE_FLAG, 'multi-window')).toBe('multi-window')
    expect(resolveFeatureVariant(FULLSCREEN_WORKSPACE_FLAG, undefined)).toBe('single-window')
    expect(resolveFeatureVariant(FULLSCREEN_WORKSPACE_FLAG, 'removed-mode')).toBe('single-window')
    expect(resolveFeatureVariant(CHARACTER_CARD_SYNC_FLAG, 'multi-window')).toBeUndefined()
  })
})
