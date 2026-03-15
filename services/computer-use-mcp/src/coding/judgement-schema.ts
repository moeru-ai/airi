import type {
  CodingPlanDraft,
  DiagnosisJudgement,
  TargetJudgement,
} from '../state'

import { z } from 'zod'

const targetKindSchema = z.enum(['definition', 'callsite', 'config', 'test', 'wiring'])
const architectureLayerSchema = z.enum(['ui', 'store', 'protocol', 'validation', 'test', 'unknown'])
const intentDecompositionSchema = z.enum(['bugfix', 'refactor', 'api_change', 'wiring', 'test_only'])
const judgeModeSchema = z.enum(['judge', 'fallback_deterministic'])

const targetJudgementSchema = z.object({
  winner: z.string().min(1),
  runnerUp: z.string().min(1).optional(),
  candidateScores: z.array(z.object({
    filePath: z.string().min(1),
    score: z.number().finite(),
    reason: z.string().min(1),
  })).min(1).max(10),
  winnerReason: z.string().min(1),
  runnerUpReason: z.string().min(1).optional(),
  whyNotRunnerUp: z.string().min(1).optional(),
  missingInformation: z.array(z.string().min(1)).max(5).default([]),
  targetKind: targetKindSchema,
  architectureLayer: architectureLayerSchema,
  intentDecomposition: intentDecompositionSchema,
  mode: judgeModeSchema.default('judge'),
}).superRefine((value, ctx) => {
  if (!value.candidateScores.some(candidate => candidate.filePath === value.winner)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'winner must appear in candidateScores.filePath',
    })
  }

  if (value.runnerUp && !value.candidateScores.some(candidate => candidate.filePath === value.runnerUp)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'runnerUp must appear in candidateScores.filePath',
    })
  }
})

const diagnosisRootCauseSchema = z.enum([
  'wrong_target',
  'missed_dependency',
  'incomplete_change',
  'baseline_noise',
  'validation_command_mismatch',
  'test_only_breakage',
])

const counterfactualCheckSchema = z.object({
  id: z.string().min(1),
  hypothesis: diagnosisRootCauseSchema,
  expectedObservation: z.string().min(1),
  observedEvidence: z.array(z.string().min(1)).max(8),
  passed: z.boolean(),
  rationale: z.string().min(1),
})

const diagnosisJudgementSchema = z.object({
  winner: diagnosisRootCauseSchema,
  runnerUp: diagnosisRootCauseSchema.optional(),
  candidateScores: z.array(z.object({
    rootCauseType: diagnosisRootCauseSchema,
    score: z.number().finite(),
    reason: z.string().min(1),
  })).min(1).max(10),
  winnerReason: z.string().min(1),
  runnerUpReason: z.string().min(1).optional(),
  disambiguationSignals: z.array(z.string().min(1)).max(8),
  conflictingEvidence: z.array(z.string().min(1)).max(8),
  counterfactualChecks: z.array(counterfactualCheckSchema).max(8).default([]),
  recommendedNextAction: z.enum(['amend', 'abort', 'continue']),
  recommendedRepairWindow: z.object({
    scope: z.enum(['current_file', 'dependency_slice', 'plan_window', 'workspace']),
    files: z.array(z.string().min(1)).max(5),
    reason: z.string().min(1),
  }),
  mode: judgeModeSchema.default('judge'),
}).superRefine((value, ctx) => {
  if (!value.candidateScores.some(candidate => candidate.rootCauseType === value.winner)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'winner must appear in candidateScores.rootCauseType',
    })
  }

  if (value.runnerUp && !value.candidateScores.some(candidate => candidate.rootCauseType === value.runnerUp)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'runnerUp must appear in candidateScores.rootCauseType',
    })
  }
})

const planDraftSchema = z.object({
  generatedAt: z.string().min(1),
  mode: z.enum(['initial', 'replan']),
  nodes: z.array(z.object({
    filePath: z.string().min(1),
    dependsOn: z.array(z.string().min(1)).max(3),
    checkpoint: z.enum(['none', 'validation_required_before_next']),
    reason: z.string().min(1),
  })).min(1).max(3),
  rationale: z.string().min(1),
}).superRefine((value, ctx) => {
  const fileSet = new Set(value.nodes.map(node => node.filePath))
  if (fileSet.size !== value.nodes.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'plan draft nodes must have unique filePath',
    })
  }

  for (const node of value.nodes) {
    for (const dep of node.dependsOn) {
      if (!fileSet.has(dep)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `dependsOn file not found in draft nodes: ${dep}`,
        })
      }
    }
  }
})

function toErrorMessage(error: z.ZodError) {
  return error.issues.map(issue => issue.message).join('; ')
}

export function validateTargetJudgement(payload: unknown): {
  ok: true
  value: TargetJudgement
} | {
  ok: false
  reason: string
} {
  const result = targetJudgementSchema.safeParse(payload)
  if (!result.success) {
    return {
      ok: false,
      reason: toErrorMessage(result.error),
    }
  }

  return {
    ok: true,
    value: result.data as TargetJudgement,
  }
}

export function validateDiagnosisJudgement(payload: unknown): {
  ok: true
  value: DiagnosisJudgement
} | {
  ok: false
  reason: string
} {
  const result = diagnosisJudgementSchema.safeParse(payload)
  if (!result.success) {
    return {
      ok: false,
      reason: toErrorMessage(result.error),
    }
  }

  return {
    ok: true,
    value: result.data as DiagnosisJudgement,
  }
}

export function validatePlanDraft(payload: unknown): {
  ok: true
  value: CodingPlanDraft
} | {
  ok: false
  reason: string
} {
  const result = planDraftSchema.safeParse(payload)
  if (!result.success) {
    return {
      ok: false,
      reason: toErrorMessage(result.error),
    }
  }

  return {
    ok: true,
    value: result.data as CodingPlanDraft,
  }
}
