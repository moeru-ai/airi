import type {
  CodingCausalTrace,
  CodingChangeDiagnosis,
  CodingCounterfactualCheck,
  CodingDiagnosisCompetition,
  CodingJudgeRootCauseType,
  DiagnosisEvidence,
} from '../state'

import { z } from 'zod'

const traceNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['signal', 'hypothesis', 'decision']),
  label: z.string().min(1),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
})

const traceEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  relation: z.enum(['supports', 'competes_with', 'drives']),
  strength: z.number().finite().min(0).max(1),
  source: z.enum(['review_risk', 'impact_analysis', 'validation_output', 'competition', 'counterfactual']),
})

const counterfactualCheckSchema = z.object({
  id: z.string().min(1),
  hypothesis: z.enum([
    'wrong_target',
    'missed_dependency',
    'incomplete_change',
    'baseline_noise',
    'validation_command_mismatch',
    'test_only_breakage',
  ]),
  expectedObservation: z.string().min(1),
  observedEvidence: z.array(z.string().min(1)).max(8),
  passed: z.boolean(),
  rationale: z.string().min(1),
})

const causalTraceSchema = z.object({
  traceId: z.string().min(1),
  createdAt: z.string().min(1),
  rootCauseType: z.enum([
    'wrong_target',
    'missed_dependency',
    'incomplete_change',
    'baseline_noise',
    'validation_command_mismatch',
    'test_only_breakage',
    'validation_environment_issue',
    'unknown',
  ]),
  nodes: z.array(traceNodeSchema).min(1).max(80),
  edges: z.array(traceEdgeSchema).min(1).max(120),
  counterfactualChecks: z.array(counterfactualCheckSchema).max(8),
})

function toErrorMessage(error: z.ZodError) {
  return error.issues.map(issue => issue.message).join('; ')
}

function buildTraceId() {
  const now = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `trace_${now}_${rand}`
}

function expectedSignalsForHypothesis(hypothesis: CodingJudgeRootCauseType) {
  switch (hypothesis) {
    case 'missed_dependency':
      return ['impact_companion_or_reference_hit', 'unexpected_files_touched']
    case 'wrong_target':
      return ['patch_verification_mismatch', 'current_file_not_touched']
    case 'incomplete_change':
      return ['validation_failed', 'unresolved_issues_remain']
    case 'baseline_noise':
      return ['baseline_comparison_baseline_noise', 'baseline_signature_test_diff_aligned']
    case 'validation_command_mismatch':
      return ['command_not_validation_like', 'no_validation_run', 'scoped_validation_command_divergent']
    case 'test_only_breakage':
      return ['assertion_snapshot_failure', 'changed_files_primarily_tests_or_fixtures']
  }
}

export function buildCounterfactualChecks(params: {
  winner: CodingJudgeRootCauseType
  runnerUp?: CodingJudgeRootCauseType
  winnerSignals: string[]
  runnerUpSignals?: string[]
}): CodingCounterfactualCheck[] {
  const hypotheses = [params.winner, ...(params.runnerUp ? [params.runnerUp] : [])]

  return hypotheses.slice(0, 2).map((hypothesis, index) => {
    const expectedSignals = expectedSignalsForHypothesis(hypothesis)
    const sourceSignals = hypothesis === params.winner ? params.winnerSignals : (params.runnerUpSignals || [])
    const observedEvidence = expectedSignals.filter(signal => sourceSignals.includes(signal)).slice(0, 4)
    const passed = observedEvidence.length > 0

    return {
      id: `cf_${index + 1}_${hypothesis}`,
      hypothesis,
      expectedObservation: `Expected at least one signal from [${expectedSignals.join(', ')}] for hypothesis ${hypothesis}.`,
      observedEvidence,
      passed,
      rationale: passed
        ? `Observed ${observedEvidence.join(', ')} supporting ${hypothesis}.`
        : `No expected signals observed for ${hypothesis}; treat as weak counterfactual support.`,
    }
  })
}

export function buildCausalTrace(params: {
  diagnosis: Pick<CodingChangeDiagnosis, 'rootCauseType' | 'nextAction'>
  competition: CodingDiagnosisCompetition
  evidenceMatrix: DiagnosisEvidence
  counterfactualChecks: CodingCounterfactualCheck[]
}): CodingCausalTrace {
  const createdAt = new Date().toISOString()
  const traceId = buildTraceId()

  const strongestSignals = Array.from(new Set([
    ...(params.evidenceMatrix.strongestSignals || []),
    ...(params.competition.winner.signals || []),
  ])).slice(0, 20)

  const nodes: CodingCausalTrace['nodes'] = [
    ...strongestSignals.map(signal => ({
      id: `signal:${signal}`,
      kind: 'signal' as const,
      label: signal,
      metadata: {
        inWinner: params.competition.winner.signals.includes(signal),
        inRunnerUp: params.competition.runnerUp.signals.includes(signal),
      },
    })),
    {
      id: `hypothesis:${params.competition.winner.rootCauseType}`,
      kind: 'hypothesis' as const,
      label: params.competition.winner.rootCauseType,
      metadata: {
        score: Number(params.competition.winner.score.toFixed(3)),
        role: 'winner',
      },
    },
    {
      id: `hypothesis:${params.competition.runnerUp.rootCauseType}`,
      kind: 'hypothesis' as const,
      label: params.competition.runnerUp.rootCauseType,
      metadata: {
        score: Number(params.competition.runnerUp.score.toFixed(3)),
        role: 'runner_up',
      },
    },
    {
      id: `decision:${params.diagnosis.rootCauseType}:${params.diagnosis.nextAction}`,
      kind: 'decision' as const,
      label: `${params.diagnosis.rootCauseType}:${params.diagnosis.nextAction}`,
      metadata: {
        nextAction: params.diagnosis.nextAction,
      },
    },
  ]

  const winnerHypothesisNodeId = `hypothesis:${params.competition.winner.rootCauseType}`
  const runnerUpHypothesisNodeId = `hypothesis:${params.competition.runnerUp.rootCauseType}`
  const decisionNodeId = `decision:${params.diagnosis.rootCauseType}:${params.diagnosis.nextAction}`

  const edges: CodingCausalTrace['edges'] = [
    ...strongestSignals.map((signal) => {
      const supportsWinner = params.competition.winner.signals.includes(signal)
      const strength = supportsWinner ? Math.max(0.45, Math.min(0.95, params.competition.winner.score)) : 0.35
      return {
        from: `signal:${signal}`,
        to: winnerHypothesisNodeId,
        relation: 'supports' as const,
        strength,
        source: signal.includes('impact') ? 'impact_analysis' as const : signal.includes('validation') ? 'validation_output' as const : 'review_risk' as const,
      }
    }),
    {
      from: runnerUpHypothesisNodeId,
      to: winnerHypothesisNodeId,
      relation: 'competes_with' as const,
      strength: Math.max(0.1, Math.min(0.9, Number(params.competition.runnerUp.score.toFixed(3)))),
      source: 'competition' as const,
    },
    {
      from: winnerHypothesisNodeId,
      to: decisionNodeId,
      relation: 'drives' as const,
      strength: Math.max(0.5, Math.min(0.99, Number(params.competition.winner.score.toFixed(3)))),
      source: 'competition' as const,
    },
    ...params.counterfactualChecks.slice(0, 4).map(check => ({
      from: `hypothesis:${check.hypothesis}`,
      to: decisionNodeId,
      relation: 'supports' as const,
      strength: check.passed ? 0.62 : 0.22,
      source: 'counterfactual' as const,
    })),
  ]

  return {
    traceId,
    createdAt,
    rootCauseType: params.diagnosis.rootCauseType,
    nodes,
    edges,
    counterfactualChecks: params.counterfactualChecks.slice(0, 8),
  }
}

export function validateCausalTrace(payload: unknown): {
  ok: true
  value: CodingCausalTrace
} | {
  ok: false
  reason: string
} {
  const result = causalTraceSchema.safeParse(payload)
  if (!result.success) {
    return {
      ok: false,
      reason: toErrorMessage(result.error),
    }
  }

  return {
    ok: true,
    value: result.data as CodingCausalTrace,
  }
}
