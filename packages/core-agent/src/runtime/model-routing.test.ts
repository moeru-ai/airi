import type { ModelProfile } from './model-profile'
import type { RoutingTask, TaskEvidence } from './model-routing'

import { describe, expect, it } from 'vitest'

import { routeModel } from './model-routing'

const task: RoutingTask = { kind: 'classifier', requirements: { tools: true }, tier: 'fast', timingTargetMs: 800 }
const configured = { providerId: 'openai', model: 'strong-model' }

function profile(model: string, overrides: Partial<ModelProfile> = {}): ModelProfile {
  return { providerId: 'openai', model, abilities: { tools: true }, tier: 'fast', latency: { firstTokenMs: 300, samples: 10 }, ...overrides }
}

const proven: TaskEvidence = { passed: 9, failed: 1 }

describe('model routing', () => {
  // A5: without task evidence, the router keeps the configured model.
  it('keeps the configured model without task evidence', () => {
    const decision = routeModel(task, configured, [profile('fast-model')], () => undefined, 0)

    expect(decision).toEqual({
      task: 'classifier',
      chosen: configured,
      fallback: true,
      candidates: [{ providerId: 'openai', model: 'fast-model', rejected: 'no-evidence', firstTokenMs: 300 }],
      decidedAt: 0,
    })
  })

  it('rejects candidates by requirements, tier, timing, and the evidence bar', () => {
    const candidates = [
      profile('no-tools', { abilities: { tools: false } }),
      profile('unknown-tools', { abilities: {} }),
      profile('untiered', { tier: undefined }),
      profile('slow', { latency: { firstTokenMs: 2000, samples: 10 } }),
      profile('weak-evidence'),
    ]
    const evidence = (candidate: ModelProfile) => candidate.model === 'weak-evidence' ? { passed: 3, failed: 2 } : proven

    const decision = routeModel(task, configured, candidates, evidence)

    expect(decision.fallback).toBe(true)
    expect(decision.candidates.map(candidate => candidate.rejected)).toEqual(['requirements', 'requirements', 'tier', 'too-slow', 'no-evidence'])
  })

  it('chooses the fastest proven candidate, never the cheapest', () => {
    const cheapSlow = profile('cheap', { latency: { firstTokenMs: 600, samples: 10 }, pricing: { units: [{ name: 'textInput', strategy: 'fixed', unit: 'millionTokens', rate: 0.01 }] } })
    const fast = profile('fast', { tier: 'strong', latency: { firstTokenMs: 200, samples: 10 } })

    const decision = routeModel(task, configured, [cheapSlow, fast], () => proven)

    expect(decision).toMatchObject({ chosen: { model: 'fast' }, fallback: false })
  })
})
