import type {
  CodingArchitectureLayer,
  CodingChangeIntent,
  CodingIntentDecomposition,
  CodingPlanFrontier,
  CodingTargetCandidate,
  CodingTargetKind,
  TargetDecisionCase,
  TargetDecisionCaseCandidate,
  TargetJudgement,
} from '../state'

import { validateTargetJudgement } from './judgement-schema'

const emptyTargetWinner = '__no_target__'

function inferTargetKindFromPath(filePath: string): CodingTargetKind {
  const normalized = filePath.toLowerCase()
  if (normalized.includes('__tests__') || normalized.endsWith('.test.ts') || normalized.endsWith('.spec.ts')) {
    return 'test'
  }
  if (normalized.includes('config') || normalized.endsWith('.json') || normalized.endsWith('.env')) {
    return 'config'
  }
  if (normalized.includes('index') || normalized.includes('register') || normalized.includes('router') || normalized.includes('main')) {
    return 'wiring'
  }
  if (normalized.includes('controller') || normalized.includes('handler') || normalized.includes('service') || normalized.includes('use-')) {
    return 'callsite'
  }

  return 'definition'
}

function inferArchitectureLayerFromPath(filePath: string): CodingArchitectureLayer {
  const normalized = filePath.toLowerCase()
  if (normalized.includes('__tests__') || normalized.includes('/test/') || normalized.includes('/tests/') || normalized.endsWith('.test.ts') || normalized.endsWith('.spec.ts')) {
    return 'test'
  }
  if (normalized.includes('/store/') || normalized.includes('/stores/') || normalized.includes('pinia') || normalized.includes('state')) {
    return 'store'
  }
  if (normalized.includes('schema') || normalized.includes('validator') || normalized.includes('validation') || normalized.includes('valibot') || normalized.includes('zod') || normalized.includes('eslint') || normalized.includes('vitest')) {
    return 'validation'
  }
  if (normalized.includes('protocol') || normalized.includes('rpc') || normalized.includes('ipc') || normalized.includes('/api/') || normalized.includes('/sdk/') || normalized.includes('contract')) {
    return 'protocol'
  }
  if (normalized.includes('component') || normalized.includes('/ui/') || normalized.includes('/pages/') || normalized.includes('/layouts/') || normalized.endsWith('.vue') || normalized.endsWith('.tsx') || normalized.endsWith('.jsx')) {
    return 'ui'
  }
  return 'unknown'
}

function inferIntentDecomposition(changeIntent: CodingChangeIntent): CodingIntentDecomposition {
  switch (changeIntent) {
    case 'behavior_fix':
      return 'bugfix'
    case 'refactor':
      return 'refactor'
    case 'api_change':
      return 'api_change'
    case 'config_change':
      return 'wiring'
    case 'test_fix':
      return 'test_only'
  }
}

function roleHintsForTargetKind(targetKind: CodingTargetKind): TargetDecisionCaseCandidate['roleHints'] {
  switch (targetKind) {
    case 'definition':
      return ['definition']
    case 'callsite':
      return ['reference']
    case 'config':
      return ['config']
    case 'test':
      return ['test']
    case 'wiring':
      return ['wiring']
  }
}

function dedupe<T>(items: T[]) {
  return Array.from(new Set(items))
}

export function buildTargetDecisionCase(params: {
  changeIntent: CodingChangeIntent
  candidates: CodingTargetCandidate[]
  impactNeighborsByFile?: Record<string, string[]>
  failingTests?: string[]
  frontier?: CodingPlanFrontier
  missingInformationHints?: string[]
}): TargetDecisionCase {
  const failingTests = params.failingTests || []
  const normalizedCandidates: TargetDecisionCaseCandidate[] = params.candidates.map((candidate) => {
    const targetKind = inferTargetKindFromPath(candidate.filePath)
    const impactNeighbors = params.impactNeighborsByFile?.[candidate.filePath] || []

    return {
      filePath: candidate.filePath,
      targetKind,
      sourceKind: candidate.sourceKind,
      roleHints: roleHintsForTargetKind(targetKind),
      impactNeighbors,
      recentlyEdited: candidate.recentlyEdited,
      recentlyRead: candidate.recentlyRead,
      failingTestHit: failingTests.some(test => test.includes(candidate.filePath)),
      score: candidate.score,
      evidence: candidate.reasons,
    }
  })

  return {
    preparedAt: new Date().toISOString(),
    changeIntent: params.changeIntent,
    candidates: normalizedCandidates,
    currentPlannerFrontier: params.frontier?.readyNodeIds || [],
    missingInformationHints: dedupe(params.missingInformationHints || []).slice(0, 5),
  }
}

export function draftDeterministicTargetJudgement(targetCase: TargetDecisionCase): TargetJudgement {
  const sorted = [...targetCase.candidates]
    .sort((left, right) => right.score - left.score || left.filePath.localeCompare(right.filePath))

  const winner = sorted[0]
  const runnerUp = sorted[1]
  if (!winner) {
    return {
      winner: emptyTargetWinner,
      candidateScores: [{
        filePath: emptyTargetWinner,
        score: 0,
        reason: 'no_candidate_available',
      }],
      winnerReason: 'No candidate available.',
      whyNotRunnerUp: 'No runner-up candidate exists.',
      missingInformation: targetCase.missingInformationHints,
      targetKind: 'definition',
      architectureLayer: 'unknown',
      intentDecomposition: inferIntentDecomposition(targetCase.changeIntent),
      mode: 'fallback_deterministic',
    }
  }

  const winnerArchitectureLayer = inferArchitectureLayerFromPath(winner.filePath)
  const intentDecomposition = inferIntentDecomposition(targetCase.changeIntent)
  const whyNotRunnerUp = runnerUp
    ? `winner=${winner.filePath} outranks runnerUp=${runnerUp.filePath} on deterministic score delta=${(winner.score - runnerUp.score).toFixed(3)}.`
    : 'No runner-up candidate exists.'

  return {
    winner: winner.filePath,
    runnerUp: runnerUp?.filePath,
    candidateScores: sorted.slice(0, 6).map(candidate => ({
      filePath: candidate.filePath,
      score: Number(candidate.score.toFixed(3)),
      reason: candidate.evidence.join(', ') || 'deterministic_score',
    })),
    winnerReason: `winner=${winner.filePath}; score=${winner.score}; intent=${targetCase.changeIntent}`,
    runnerUpReason: runnerUp
      ? `runner_up=${runnerUp.filePath}; score=${runnerUp.score}; delta=${(winner.score - runnerUp.score).toFixed(3)}`
      : 'runner_up=none',
    whyNotRunnerUp,
    missingInformation: targetCase.missingInformationHints,
    targetKind: winner.targetKind,
    architectureLayer: winnerArchitectureLayer,
    intentDecomposition,
    mode: 'judge',
  }
}

export function resolveTargetJudgement(params: {
  targetCase: TargetDecisionCase
  proposedJudgement?: unknown
}): {
  judgement: TargetJudgement
  usedFallback: boolean
  fallbackReason?: string
} {
  const deterministic = draftDeterministicTargetJudgement(params.targetCase)
  const candidatePayload = params.proposedJudgement ?? deterministic
  const validated = validateTargetJudgement(candidatePayload)

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
    fallbackReason: 'reason' in validated ? validated.reason : 'invalid_target_judgement',
  }
}
