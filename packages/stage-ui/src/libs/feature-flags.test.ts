import type { FeatureFlag } from './feature-flags'

import { parse } from 'valibot'
import { describe, expect, it } from 'vitest'

import { featureFlagResponseSchema, resolveFeatureFlag } from './feature-flags'

const feature: FeatureFlag = { key: 'test-feature', titleKey: 'test.title', descriptionKey: 'test.description', defaultEnabled: false, mode: 'local' }

describe('feature flag decisions', () => {
  it('allows local choices without a cloud grant or an account', () => {
    expect(resolveFeatureFlag(feature, undefined, undefined, false)).toEqual({ enabled: false, source: 'default', selectable: true })
    expect(resolveFeatureFlag(feature, true, undefined, false)).toEqual({ enabled: true, source: 'local', selectable: true })
  })

  it('ignores cloud policies for local-only flags', () => {
    expect(resolveFeatureFlag(feature, false, { key: feature.key, mode: 'cloud-controlled', source: 'global' }, true).enabled).toBe(false)
  })

  it.each(['cloud-opt-in', 'cloud-controlled'] as const)('hides and disables missing %s grants despite saved preferences', (mode) => {
    expect(resolveFeatureFlag({ ...feature, mode, defaultEnabled: true }, true, undefined, true))
      .toEqual({ enabled: false, source: 'default', selectable: false })
  })

  it('requires an account for opt-in grants and starts disabled', () => {
    const optIn: FeatureFlag = { ...feature, mode: 'cloud-opt-in' }
    const policy = { key: feature.key, mode: 'cloud-opt-in', source: 'account' } as const
    expect(resolveFeatureFlag(optIn, true, policy, false)).toEqual({ enabled: false, source: 'default', selectable: false })
    expect(resolveFeatureFlag(optIn, undefined, policy, true)).toEqual({ enabled: false, source: 'account', selectable: true })
    expect(resolveFeatureFlag(optIn, true, policy, true)).toEqual({ enabled: true, source: 'local', selectable: true })
    expect(resolveFeatureFlag(optIn, false, policy, true).enabled).toBe(false)
  })

  it('applies cloud control without exposing a toggle or accepting device preferences', () => {
    const controlled: FeatureFlag = { ...feature, mode: 'cloud-controlled' }
    const policy = { key: feature.key, mode: 'cloud-controlled', source: 'global' } as const
    expect(resolveFeatureFlag(controlled, false, policy, false)).toEqual({ enabled: true, source: 'global', selectable: false })
    expect(resolveFeatureFlag(controlled, true, undefined, true).enabled).toBe(false)
  })

  it('fails closed when client registration and cloud mode disagree', () => {
    expect(resolveFeatureFlag({ ...feature, mode: 'cloud-opt-in' }, true, { key: feature.key, mode: 'cloud-controlled', source: 'global' }, true).enabled).toBe(false)
    expect(resolveFeatureFlag({ ...feature, mode: 'cloud-controlled' }, true, { key: 'other', mode: 'cloud-controlled', source: 'global' }, true).enabled).toBe(false)
  })

  it('validates cloud modes at the response boundary', () => {
    expect(() => parse(featureFlagResponseSchema, { flags: [{ key: feature.key, mode: 'local', source: 'account' }] })).toThrow()
  })
})
