import type { FeatureFlag } from './feature-flags'

import { parse } from 'valibot'
import { describe, expect, it } from 'vitest'

import { featureFlagResponseSchema, resolveFeatureFlag } from './feature-flags'

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

  it('applies cloud control without exposing a toggle or accepting device preferences', () => {
    const controlled: FeatureFlag = { ...feature, availability: 'cloud' }
    const policy = { key: feature.key, mode: 'cloud-controlled', source: 'global' } as const
    expect(resolveFeatureFlag(controlled, false, policy, false)).toEqual({ enabled: true, source: 'global', selectable: false })
    expect(resolveFeatureFlag(controlled, true, undefined, true).enabled).toBe(false)
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
})
