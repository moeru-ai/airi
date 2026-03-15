/**
 * Smoke: dual-branch (5-node) frontier runtime keeps layered/recovery semantics.
 *
 * Verifies:
 * 1) 5-node graph can expose a dual branch frontier after root validation
 * 2) runner-up branch remains visible while one branch enters recovery_retry
 * 3) recovered node can still win over competing ready branch via recovery_retry semantics
 */

import { exit } from 'node:process'

import {
  buildPlanGraphFromSession,
  decideNextPlannerNode,
  markCheckpointOutcome,
  recoverNeedsReplanNode,
} from '../coding/planner-graph'

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

function createSession() {
  return {
    id: 'smoke_dual_branch_frontier_runtime',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'active' as const,
    amendCount: 0,
    backtrackCount: 0,
    maxAmendCount: 2 as const,
    maxBacktrackCount: 1 as const,
    maxFiles: 3 as const,
    changeIntent: 'behavior_fix' as const,
    steps: [
      {
        filePath: 'src/a.ts',
        intent: 'behavior_fix' as const,
        source: 'target_selection' as const,
        status: 'ready' as const,
        dependsOn: [],
        checkpoint: 'none' as const,
      },
      {
        filePath: 'src/b.ts',
        intent: 'behavior_fix' as const,
        source: 'search' as const,
        status: 'blocked_by_dependency' as const,
        dependsOn: ['src/a.ts'],
        checkpoint: 'validation_required_before_next' as const,
      },
      {
        filePath: 'src/c.ts',
        intent: 'behavior_fix' as const,
        source: 'search' as const,
        status: 'blocked_by_dependency' as const,
        dependsOn: ['src/a.ts'],
        checkpoint: 'validation_required_before_next' as const,
      },
      {
        filePath: 'src/d.ts',
        intent: 'behavior_fix' as const,
        source: 'search' as const,
        status: 'blocked_by_dependency' as const,
        dependsOn: ['src/b.ts'],
        checkpoint: 'validation_required_before_next' as const,
      },
      {
        filePath: 'src/e.ts',
        intent: 'behavior_fix' as const,
        source: 'search' as const,
        status: 'blocked_by_dependency' as const,
        dependsOn: ['src/c.ts'],
        checkpoint: 'validation_required_before_next' as const,
      },
    ],
    reason: 'dual branch frontier runtime smoke',
  }
}

function main() {
  console.info('╔═══════════════════════════════════════════════════════════════════════╗')
  console.info('║  Smoke Gate: dual-branch frontier runtime                            ║')
  console.info('╚═══════════════════════════════════════════════════════════════════════╝')

  const session = createSession()
  const graph = buildPlanGraphFromSession(session)

  const initial = decideNextPlannerNode({
    graph,
    changeIntent: 'behavior_fix',
  })

  assert(initial.decision != null, 'initial decision must exist')
  assert(initial.decision.selectionMode === 'dependency_ready', `expected dependency_ready, got ${String(initial.decision.selectionMode)}`)
  assert(initial.decision.selectedFile === 'src/a.ts', `expected src/a.ts, got ${String(initial.decision.selectedFile)}`)

  const graphAfterAValidated = markCheckpointOutcome({
    graph,
    filePath: 'src/a.ts',
    passed: true,
  })

  const branchFrontier = decideNextPlannerNode({
    graph: graphAfterAValidated,
    previousGraph: graph,
    changeIntent: 'behavior_fix',
  })

  const branchReadyFiles = branchFrontier.decision?.candidateScores.map(candidate => candidate.filePath) || []
  assert(branchReadyFiles.includes('src/b.ts'), 'dual branch should include src/b.ts after validating src/a.ts')
  assert(branchReadyFiles.includes('src/c.ts'), 'dual branch should include src/c.ts after validating src/a.ts')

  const graphBFailed = markCheckpointOutcome({
    graph: graphAfterAValidated,
    filePath: 'src/b.ts',
    passed: false,
  })
  const graphBRecovered = recoverNeedsReplanNode({
    graph: graphBFailed,
    filePath: 'src/b.ts',
  })

  const recoveryDecision = decideNextPlannerNode({
    graph: graphBRecovered,
    previousGraph: graphBFailed,
    changeIntent: 'behavior_fix',
  })

  assert(recoveryDecision.decision != null, 'recovery decision must exist')
  assert(recoveryDecision.decision.selectionMode === 'recovery_retry', `expected recovery_retry, got ${String(recoveryDecision.decision?.selectionMode)}`)
  assert(recoveryDecision.decision.selectedFile === 'src/b.ts', `expected src/b.ts, got ${String(recoveryDecision.decision?.selectedFile)}`)
  assert((recoveryDecision.decision.whyNotRunnerUp?.explanation || '').length > 0, 'recovery decision should include why-not runner-up explanation')

  console.info('\n✅ Smoke passed: dual-branch (5-node) frontier runtime preserves dependency_ready/recovery_retry semantics.')
}

try {
  main()
}
catch (error) {
  console.error('\n❌ DUAL-BRANCH FRONTIER RUNTIME SMOKE FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
}
