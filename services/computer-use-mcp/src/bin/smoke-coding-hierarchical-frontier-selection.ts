/**
 * Smoke: hierarchical frontier selection keeps dependency_ready/recovery_retry semantics.
 *
 * Verifies:
 * 1) layered frontier exposes active task + subtask readiness
 * 2) first decision chooses dependency_ready on a fresh layered graph
 * 3) after needs_replan -> ready transition, planner chooses recovery_retry
 * 4) why-not runner-up explanation is emitted
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
    id: 'smoke_hierarchical_frontier',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'active' as const,
    amendCount: 0,
    backtrackCount: 0,
    maxAmendCount: 2 as const,
    maxBacktrackCount: 1 as const,
    maxFiles: 2 as const,
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
    ],
    reason: 'hierarchical frontier smoke',
  }
}

function main() {
  console.info('╔═══════════════════════════════════════════════════════════════════════╗')
  console.info('║  Smoke Gate: hierarchical frontier selection                         ║')
  console.info('╚═══════════════════════════════════════════════════════════════════════╝')

  const session = createSession()
  const graph = buildPlanGraphFromSession(session)

  const initialDecision = decideNextPlannerNode({
    graph,
    changeIntent: 'behavior_fix',
  })

  assert(initialDecision.frontier.activeTaskNodeId != null, 'frontier must include activeTaskNodeId')
  assert(initialDecision.frontier.readySubtaskIds.length > 0, 'frontier must include readySubtaskIds')
  assert(initialDecision.decision != null, 'initial decision must exist')
  assert(initialDecision.decision?.selectionMode === 'dependency_ready', `expected dependency_ready, got ${String(initialDecision.decision?.selectionMode)}`)
  assert(initialDecision.decision?.whyNotRunnerUp != null, 'initial decision should include why-not runner-up explanation')

  const failedGraph = markCheckpointOutcome({
    graph,
    filePath: 'src/a.ts',
    passed: false,
  })
  const recoveredGraph = recoverNeedsReplanNode({
    graph: failedGraph,
    filePath: 'src/a.ts',
  })

  const recoveryDecision = decideNextPlannerNode({
    graph: recoveredGraph,
    previousGraph: failedGraph,
    changeIntent: 'behavior_fix',
  })

  assert(recoveryDecision.decision != null, 'recovery decision must exist')
  assert(recoveryDecision.decision?.selectionMode === 'recovery_retry', `expected recovery_retry, got ${String(recoveryDecision.decision?.selectionMode)}`)
  assert(recoveryDecision.decision?.whyNotRunnerUp != null, 'recovery decision should include why-not runner-up explanation')

  console.info('\n✅ Smoke passed: layered frontier keeps dependency_ready/recovery_retry selection semantics.')
}

try {
  main()
}
catch (error) {
  console.error('\n❌ HIERARCHICAL FRONTIER SELECTION SMOKE FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
}
