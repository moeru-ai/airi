import type {
  CodingChangeIntent,
  CodingDiagnosisCandidateScore,
  CodingDiagnosisCompetition,
  CodingJudgeRootCauseType,
  DiagnosisCase,
  DiagnosisJudgement,
} from '../state'

import { validateDiagnosisJudgement } from './judgement-schema'

const allowedRootCauses: CodingJudgeRootCauseType[] = [
  'wrong_target',
  'missed_dependency',
  'incomplete_change',
  'baseline_noise',
  'validation_command_mismatch',
  'test_only_breakage',
]

function toJudgeRootCause(type: string | undefined): CodingJudgeRootCauseType | undefined {
  if (!type) {
    return undefined
  }

  return allowedRootCauses.find(item => item === type)
}

function buildReasonFromCandidate(candidate: CodingDiagnosisCandidateScore | undefined) {
  if (!candidate) {
    return 'candidate missing'
  }

  return `signals=${candidate.signals.join(', ') || 'none'}; score=${candidate.score.toFixed(3)}`
}

export function buildDiagnosisCase(params: {
  taskGoal: string
  changeIntent: CodingChangeIntent
  currentNode?: string
  changedFiles: string[]
  touchedSymbols: string[]
  impactCompanions: string[]
  failingTests: string[]
  stderrSignature?: string
  baselineComparison: 'new_red' | 'baseline_noise' | 'unknown'
  scopedValidationCommand?: string
  unresolvedIssues: string[]
  candidateRootCauses: CodingDiagnosisCandidateScore[]
}): DiagnosisCase {
  return {
    preparedAt: new Date().toISOString(),
    taskGoal: params.taskGoal,
    changeIntent: params.changeIntent,
    currentNode: params.currentNode,
    changedFiles: params.changedFiles.slice(0, 12),
    touchedSymbols: params.touchedSymbols.slice(0, 20),
    impactCompanions: params.impactCompanions.slice(0, 12),
    failingTests: params.failingTests.slice(0, 20),
    stderrSignature: params.stderrSignature,
    baselineComparison: params.baselineComparison,
    scopedValidationCommand: params.scopedValidationCommand,
    unresolvedIssues: params.unresolvedIssues.slice(0, 12),
    candidateRootCauses: params.candidateRootCauses.slice(0, 8),
  }
}

export function draftDeterministicDiagnosisJudgement(params: {
  diagnosisCase: DiagnosisCase
  competition: CodingDiagnosisCompetition
  recommendedNextAction: DiagnosisJudgement['recommendedNextAction']
  recommendedRepairWindow: DiagnosisJudgement['recommendedRepairWindow']
  conflictingEvidence: string[]
  counterfactualChecks?: DiagnosisJudgement['counterfactualChecks']
}): DiagnosisJudgement {
  const winner = toJudgeRootCause(params.competition.winner.rootCauseType)
    || toJudgeRootCause(params.diagnosisCase.candidateRootCauses[0]?.rootCauseType)
    || 'incomplete_change'

  const runnerUp = toJudgeRootCause(params.competition.runnerUp.rootCauseType)
    || toJudgeRootCause(params.diagnosisCase.candidateRootCauses.find(candidate => candidate.rootCauseType !== winner)?.rootCauseType)

  const candidateScores = params.diagnosisCase.candidateRootCauses
    .map((candidate) => {
      const rootCauseType = toJudgeRootCause(candidate.rootCauseType)
      if (!rootCauseType) {
        return undefined
      }

      return {
        rootCauseType,
        score: Number(candidate.score.toFixed(3)),
        reason: buildReasonFromCandidate(candidate),
      }
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .slice(0, 6)

  if (!candidateScores.some(candidate => candidate.rootCauseType === winner)) {
    candidateScores.unshift({
      rootCauseType: winner,
      score: Number(params.competition.winner.score.toFixed(3)),
      reason: buildReasonFromCandidate(params.competition.winner),
    })
  }

  if (runnerUp && !candidateScores.some(candidate => candidate.rootCauseType === runnerUp)) {
    candidateScores.push({
      rootCauseType: runnerUp,
      score: Number(params.competition.runnerUp.score.toFixed(3)),
      reason: buildReasonFromCandidate(params.competition.runnerUp),
    })
  }

  return {
    winner,
    runnerUp,
    candidateScores,
    winnerReason: params.competition.winnerReason,
    runnerUpReason: params.competition.runnerUpReason,
    disambiguationSignals: params.competition.disambiguationSignals.slice(0, 8),
    conflictingEvidence: params.conflictingEvidence.slice(0, 8),
    counterfactualChecks: (params.counterfactualChecks || []).slice(0, 8),
    recommendedNextAction: params.recommendedNextAction,
    recommendedRepairWindow: params.recommendedRepairWindow,
    mode: 'judge',
  }
}

export function resolveDiagnosisJudgement(params: {
  diagnosisCase: DiagnosisCase
  competition: CodingDiagnosisCompetition
  recommendedNextAction: DiagnosisJudgement['recommendedNextAction']
  recommendedRepairWindow: DiagnosisJudgement['recommendedRepairWindow']
  conflictingEvidence: string[]
  counterfactualChecks?: DiagnosisJudgement['counterfactualChecks']
  proposedJudgement?: unknown
}): {
  judgement: DiagnosisJudgement
  usedFallback: boolean
  fallbackReason?: string
} {
  const deterministic = draftDeterministicDiagnosisJudgement({
    diagnosisCase: params.diagnosisCase,
    competition: params.competition,
    recommendedNextAction: params.recommendedNextAction,
    recommendedRepairWindow: params.recommendedRepairWindow,
    conflictingEvidence: params.conflictingEvidence,
    counterfactualChecks: params.counterfactualChecks,
  })

  const candidatePayload = params.proposedJudgement ?? deterministic
  const validated = validateDiagnosisJudgement(candidatePayload)

  if (validated.ok) {
    return {
      judgement: validated.value,
      usedFallback: false,
    }
  }

  return {
    judgement: {
      ...deterministic,
      mode: 'fallback_deterministic',
    },
    usedFallback: true,
    fallbackReason: 'reason' in validated ? validated.reason : 'invalid_diagnosis_judgement',
  }
}
