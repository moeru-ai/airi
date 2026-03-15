/**
 * Smoke: long-session compaction + round-context anchor stability.
 *
 * Verifies runtime guard rails for long-running coding sessions:
 * 1) oversized coding buckets are compacted deterministically
 * 2) compaction metadata is emitted
 * 3) roundContext anchors stay stable after repeated refresh
 */

import type { CodingCausalTrace, CodingPlanSession } from '../state'

import { exit } from 'node:process'

import { RunStateManager } from '../state'

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

function createPlanSession(index: number): CodingPlanSession {
  return {
    id: `session_${index}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    status: 'active',
    amendCount: 0,
    backtrackCount: 0,
    maxAmendCount: 2,
    maxBacktrackCount: 1,
    maxFiles: 2,
    changeIntent: 'behavior_fix',
    steps: [{
      filePath: 'src/main.ts',
      intent: 'behavior_fix',
      source: 'target_selection',
      status: 'ready',
      dependsOn: [],
      checkpoint: 'none',
    }],
    reason: 'long-session-compaction-smoke',
  }
}

function createCausalTrace(index: number): CodingCausalTrace {
  return {
    traceId: `trace_${index}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 1, index)).toISOString(),
    rootCauseType: index % 3 === 0 ? 'wrong_target' : index % 3 === 1 ? 'missed_dependency' : 'incomplete_change',
    nodes: [{
      id: `signal:${index}`,
      kind: 'signal',
      label: `signal_${index}`,
    }],
    edges: [{
      from: `signal:${index}`,
      to: `decision:${index}`,
      relation: 'supports',
      strength: 0.7,
      source: 'competition',
    }],
    counterfactualChecks: [],
  }
}

function main() {
  console.info('╔═══════════════════════════════════════════════════════════════════════╗')
  console.info('║  Smoke Gate: long-session compaction + anchor stability              ║')
  console.info('╚═══════════════════════════════════════════════════════════════════════╝')

  const manager = new RunStateManager()

  manager.updateCodingState({
    workspacePath: '/tmp/airi-long-session-smoke',
    gitSummary: 'dirty',
    recentReads: [],
    recentEdits: [],
    recentCommandResults: [],
    recentSearches: [],
    pendingIssues: [],
    lastPlannerDecision: {
      selectedFile: 'src/main.ts',
      candidateScores: [{
        filePath: 'src/main.ts',
        status: 'ready',
        score: 120,
        reasons: ['selected'],
      }],
      decisionReason: 'Planner selected src/main.ts',
      selectionMode: 'dependency_ready',
    },
    currentPlanSession: {
      ...createPlanSession(0),
      status: 'investigating',
      steps: [{
        filePath: 'src/main.ts',
        intent: 'behavior_fix',
        source: 'target_selection',
        status: 'in_progress',
        dependsOn: [],
        checkpoint: 'none',
      }],
    },
  })

  for (let round = 0; round < 8; round += 1) {
    const traceBatch = Array.from({ length: 36 }, (_, index) => createCausalTrace(round * 36 + index))
    const previousLog = manager.getState().coding?.causalTraceLog || []

    manager.updateCodingState({
      recentReads: Array.from({ length: 180 }, (_, index) => ({ path: `src/read-${round}-${index}.ts`, range: 'all' })),
      recentEdits: Array.from({ length: 180 }, (_, index) => ({ path: `src/edit-${round}-${index}.ts`, summary: 'edited' })),
      recentCommandResults: Array.from({ length: 120 }, (_, index) => `round=${round} cmd=${index}`),
      recentSearches: Array.from({ length: 120 }, (_, index) => `round=${round} search=${index}`),
      pendingIssues: Array.from({ length: 60 }, (_, index) => `round=${round} issue=${index}`),
      planHistory: Array.from({ length: 45 }, (_, index) => createPlanSession(round * 45 + index)),
      causalTraceLog: [...previousLog, ...traceBatch],
      lastCausalTrace: traceBatch[traceBatch.length - 1],
    })

    manager.refreshCodingRoundContext()
  }

  const coding = manager.getState().coding
  assert(coding != null, 'coding state should exist')

  assert((coding.recentReads || []).length <= 40, `recentReads should be compacted to <= 40, got ${(coding.recentReads || []).length}`)
  assert((coding.recentEdits || []).length <= 40, `recentEdits should be compacted to <= 40, got ${(coding.recentEdits || []).length}`)
  assert((coding.recentCommandResults || []).length <= 20, `recentCommandResults should be compacted to <= 20, got ${(coding.recentCommandResults || []).length}`)
  assert((coding.recentSearches || []).length <= 20, `recentSearches should be compacted to <= 20, got ${(coding.recentSearches || []).length}`)
  assert((coding.pendingIssues || []).length <= 20, `pendingIssues should be compacted to <= 20, got ${(coding.pendingIssues || []).length}`)
  assert((coding.planHistory || []).length <= 12, `planHistory should be compacted to <= 12, got ${(coding.planHistory || []).length}`)
  assert((coding.causalTraceLog || []).length <= 24, `causalTraceLog should be compacted to <= 24, got ${(coding.causalTraceLog || []).length}`)

  assert((coding.compactionMeta?.compactionCount || 0) > 0, 'compactionMeta.compactionCount should be > 0')
  assert((coding.compactionMeta?.compactedBuckets || []).length > 0, 'compactedBuckets should be non-empty')

  assert(coding.lastPlannerDecision?.selectedFile === 'src/main.ts', 'lastPlannerDecision anchor should stay stable')
  assert(coding.roundContext?.activeFile === 'src/main.ts', 'roundContext.activeFile should stay anchored on src/main.ts')
  assert((coding.roundContext?.anchors || []).some(anchor => anchor.includes('last_decision:src/main.ts')), 'roundContext anchors should include last_decision for src/main.ts')
  assert((coding.roundContext?.anchors || []).some(anchor => anchor.startsWith('compaction:')), 'roundContext anchors should include compaction marker')

  console.info('✅ Smoke passed: long-session compaction and round-context anchors are stable.')
}

try {
  main()
}
catch (error) {
  console.error('\n❌ LONG-SESSION COMPACTION SMOKE FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
}
