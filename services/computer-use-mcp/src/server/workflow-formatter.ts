/**
 * Outward formatter for workflow execution results.
 *
 * Converts engine-internal `WorkflowExecutionResult` into a stable
 * MCP response shape. The reroute branch emits the
 * `WorkflowRerouteStructuredContent` contract.
 */

import type { WorkflowRerouteDetail } from '../reroute-contract'
import type { RunState } from '../state'
import type { StrategyAdvisory } from '../strategy'
import type { WorkflowExecutionResult, WorkflowStepResult } from '../workflows/engine'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function formatWorkflowStructuredContent(params: {
  result: WorkflowExecutionResult
  runState: RunState
  workflowId: string
}) {
  const { result, runState, workflowId } = params
  const formattedSteps = formatStepResults(result.stepResults)

  // --- Reroute: stable contract (kind: 'workflow_reroute') ---
  if (result.status === 'reroute_required' && result.rerouteAdvisory) {
    return {
      kind: 'workflow_reroute' as const,
      reroute: buildRerouteDetail(result.rerouteAdvisory, result.stepResults, runState),
      status: 'reroute_required' as const,
      stepResults: formattedSteps,
      task: result.task,
      workflow: workflowId,
    }
  }

  // --- Paused ---
  if (result.suspension) {
    return {
      kind: 'workflow_result' as const,
      pausedAtStep: result.suspension.pausedAtStepIndex,
      resumeHint: 'Call workflow_resume after approving the pending action to continue.',
      status: 'paused' as const,
      stepResults: formattedSteps,
      task: result.task,
      workflow: workflowId,
    }
  }

  // --- Completed / failed ---
  return {
    kind: 'workflow_result' as const,
    status: (result.success ? 'completed' : 'failed') as 'completed' | 'failed',
    stepResults: formattedSteps,
    task: result.task,
    workflow: workflowId,
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildRerouteDetail(
  advisory: StrategyAdvisory,
  stepResults: WorkflowStepResult[],
  runState: RunState,
): WorkflowRerouteDetail {
  const isBrowserReroute = advisory.recommendedSurface === 'browser_dom'
    || advisory.recommendedSurface === 'browser_cdp'
  const isTerminalReroute = advisory.recommendedSurface === 'pty'

  // executionReason: the formatter MUST NOT fabricate reasons on behalf of
  // the execution layer. Only forward an explicit `executionReason` string
  // if the prep/runtime layer provided one natively in metadata.
  const rerouteStep = stepResults.find(r => r.status === 'reroute_required')
  const prepMeta = rerouteStep?.preparatoryResults
    ?.find(p => p.succeeded && p.toolName === advisory.suggestedToolName)
  const executionReason = typeof prepMeta?.metadata?.executionReason === 'string'
    ? prepMeta.metadata.executionReason
    : undefined
  const ptySessionId = typeof prepMeta?.metadata?.sessionId === 'string'
    ? prepMeta.metadata.sessionId
    : runState.activePtySessionId

  return {
    recommendedSurface: advisory.recommendedSurface,
    strategyReason: advisory.reason,
    suggestedTool: advisory.suggestedToolName ?? 'unknown',
    ...(executionReason ? { executionReason } : {}),
    explanation: `Workflow stopped safely before continuing on the wrong execution surface. ${advisory.reason}`,
    ...(isBrowserReroute && runState.browserSurfaceAvailability
      ? {
          availableSurfaces: runState.browserSurfaceAvailability.availableSurfaces,
          preferredSurface: runState.browserSurfaceAvailability.preferredSurface,
        }
      : {}),
    ...(isTerminalReroute
      ? {
          terminalSurface: 'pty' as const,
          ...(ptySessionId ? { ptySessionId } : {}),
        }
      : {}),
  }
}

function formatStepResults(stepResults: WorkflowStepResult[]) {
  return stepResults.map(r => ({
    explanation: r.explanation,
    label: r.step.label,
    status: r.status,
    succeeded: r.succeeded,
    ...(r.preparatoryResults ? { preparatoryResults: r.preparatoryResults } : {}),
  }))
}
