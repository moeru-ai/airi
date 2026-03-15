import { describe, expect, it } from 'vitest'

import { buildCausalTrace, buildCounterfactualChecks, validateCausalTrace } from './causal-trace'

describe('causal-trace', () => {
  it('builds deterministic counterfactual checks for winner/runner-up hypotheses', () => {
    const checks = buildCounterfactualChecks({
      winner: 'missed_dependency',
      runnerUp: 'wrong_target',
      winnerSignals: ['impact_companion_or_reference_hit'],
      runnerUpSignals: ['patch_verification_mismatch'],
    })

    expect(checks.length).toBe(2)
    expect(checks[0]?.hypothesis).toBe('missed_dependency')
    expect(checks[0]?.passed).toBe(true)
    expect(checks[1]?.hypothesis).toBe('wrong_target')
    expect(checks[1]?.passed).toBe(true)
  })

  it('builds replayable causal trace and passes schema validation', () => {
    const checks = buildCounterfactualChecks({
      winner: 'incomplete_change',
      runnerUp: 'missed_dependency',
      winnerSignals: ['validation_failed', 'unresolved_issues_remain'],
      runnerUpSignals: ['impact_companion_or_reference_hit'],
    })

    const trace = buildCausalTrace({
      diagnosis: {
        rootCauseType: 'incomplete_change',
        nextAction: 'amend',
      },
      competition: {
        winner: {
          rootCauseType: 'incomplete_change',
          score: 0.71,
          signals: ['validation_failed', 'unresolved_issues_remain'],
        },
        runnerUp: {
          rootCauseType: 'missed_dependency',
          score: 0.58,
          signals: ['impact_companion_or_reference_hit'],
        },
        winnerReason: 'winner=incomplete_change',
        runnerUpReason: 'runner_up=missed_dependency',
        whyNotRunnerUpReason: 'margin=0.13',
        disambiguationSignals: ['validation_failed'],
        contestedSignals: [],
        conflicts: [],
      },
      evidenceMatrix: {
        changedFiles: ['src/a.ts'],
        touchedSymbols: ['flag'],
        impactCompanions: ['src/b.ts'],
        failingTests: ['src/a.test.ts > should pass'],
        baselineComparison: 'new_red',
        strongestSignals: ['validation_failed', 'unresolved_issues_remain'],
      },
      counterfactualChecks: checks,
    })

    const validation = validateCausalTrace(trace)
    expect(validation.ok).toBe(true)
    if (!validation.ok) {
      return
    }

    expect(validation.value.traceId.length).toBeGreaterThan(0)
    expect(validation.value.nodes.some(node => node.kind === 'signal')).toBe(true)
    expect(validation.value.nodes.some(node => node.kind === 'hypothesis')).toBe(true)
    expect(validation.value.nodes.some(node => node.kind === 'decision')).toBe(true)
    expect(validation.value.edges.length).toBeGreaterThan(0)
    expect(JSON.parse(JSON.stringify(validation.value)).traceId).toBe(validation.value.traceId)
  })
})
