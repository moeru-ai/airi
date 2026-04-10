import type { RunState } from '../state'
import type { CoordinateSpaceInfo, ExecutionTarget, PolicyDecision } from '../types'

export function describeForegroundContext(record: { appName?: string, windowTitle?: string, available: boolean }) {
  if (!record.available)
    return 'foreground context unavailable'

  return `${record.appName || 'unknown app'}${record.windowTitle ? ` / ${record.windowTitle}` : ''}`
}

export function describePolicy(decision: PolicyDecision) {
  const state = decision.allowed ? 'allowed' : 'denied'
  return `${state}, risk=${decision.riskLevel}, units=${decision.estimatedOperationUnits}${decision.requiresApproval ? ', approval required' : ''}`
}

export function describeExecutionTarget(target: ExecutionTarget) {
  if (target.mode === 'dry-run')
    return `local dry-run on ${target.hostName}`
  if (target.mode === 'local-windowed')
    return `local macOS windowed execution on ${target.hostName}`

  return `${target.hostName}${target.displayId ? ` ${target.displayId}` : ''}${target.sessionTag ? ` (${target.sessionTag})` : ''}`
}

export function summarizeCoordinateSpace(info: CoordinateSpaceInfo) {
  if (info.aligned === true)
    return 'aligned'
  if (info.aligned === false)
    return 'mismatch'
  return 'unknown'
}

export function summarizeRunStateConcise(state: RunState): string {
  const parts: string[] = []

  if (state.foregroundContext) {
    parts.push(`Foreground: ${describeForegroundContext(state.foregroundContext)}`)
  }

  if (state.terminalState?.lastCommandSummary) {
    parts.push(`Last Cmd: ${state.terminalState.lastCommandSummary} (exit ${state.terminalState.lastExitCode})`)
  }

  if (state.activeTask) {
    parts.push(`Task Phase: ${state.activeTask.phase}`)
  }

  return parts.join(' | ') || 'No runtime context available'
}
