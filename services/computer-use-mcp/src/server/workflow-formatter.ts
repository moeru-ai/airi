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
  workflowId: string
  result: WorkflowExecutionResult
  runState: RunState
}) {
  const { workflowId, result, runState } = params
  const formattedSteps = formatStepResults(result.stepResults)

  // --- Reroute: stable contract (kind: 'workflow_reroute') ---
  if (result.status === 'reroute_required' && result.rerouteAdvisory) {
    return {
      kind: 'workflow_reroute' as const,
      status: 'reroute_required' as const,
      workflow: workflowId,
      reroute: buildRerouteDetail(result.rerouteAdvisory, result.stepResults, runState),
      task: result.task,
      stepResults: formattedSteps,
    }
  }

  // --- Paused ---
  if (result.suspension) {
    return {
      kind: 'workflow_result' as const,
      status: 'paused' as const,
      workflow: workflowId,
      task: result.task,
      stepResults: formattedSteps,
      resumeHint: 'Call workflow_resume after approving the pending action to continue.',
      pausedAtStep: result.suspension.pausedAtStepIndex,
    }
  }

  // --- Completed / failed ---
  return {
    kind: 'workflow_result' as const,
    status: (result.success ? 'completed' : 'failed') as 'completed' | 'failed',
    workflow: workflowId,
    task: result.task,
    stepResults: formattedSteps,
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatStepResults(stepResults: WorkflowStepResult[]) {
  return stepResults.map(r => ({
    label: r.step.label,
    succeeded: r.succeeded,
    status: r.status,
    explanation: r.explanation,
    ...(r.preparatoryResults ? { preparatoryResults: r.preparatoryResults } : {}),
  }))
}

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
    suggestedTool: advisory.suggestedToolName ?? 'unknown',
    strategyReason: advisory.reason,
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
