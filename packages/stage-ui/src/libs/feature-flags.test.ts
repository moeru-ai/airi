import { describe, expect, it } from 'vitest'

import { resolveFeatureFlag } from './feature-flags'

const feature = { key: 'test-feature', titleKey: 'test.title', descriptionKey: 'test.description', defaultEnabled: false }

describe('feature flag decisions', () => {
  it('uses the client default without a policy or device choice', () => {
    expect(resolveFeatureFlag(feature, undefined, undefined)).toEqual({ enabled: false, source: 'default', locked: false })
  })

  it('preserves an explicit false device choice over an enabled global default', () => {
    expect(resolveFeatureFlag(feature, false, { key: feature.key, enabled: true, source: 'global', allowLocalOverride: true }))
      .toEqual({ enabled: false, source: 'local', locked: false })
  })

  it('prevents local choices from overriding a managed global policy', () => {
    expect(resolveFeatureFlag(feature, true, { key: feature.key, enabled: false, source: 'global', allowLocalOverride: false }))
      .toEqual({ enabled: false, source: 'global', locked: true })
  })

  it('keeps account policy authoritative even when local overrides are allowed globally', () => {
    expect(resolveFeatureFlag(feature, true, { key: feature.key, enabled: false, source: 'account', allowLocalOverride: true }))
      .toEqual({ enabled: false, source: 'account', locked: true })
  })

  it('returns to global policy when the device choice is removed', () => {
    expect(resolveFeatureFlag(feature, undefined, { key: feature.key, enabled: true, source: 'global', allowLocalOverride: true }))
      .toEqual({ enabled: true, source: 'global', locked: false })
  })

  it('rejects malformed remote policy instead of treating string false as enabled', () => {
    expect(() => resolveFeatureFlag(feature, undefined, { key: feature.key, enabled: 'false', source: 'global', allowLocalOverride: true })).toThrow()
  })
})
