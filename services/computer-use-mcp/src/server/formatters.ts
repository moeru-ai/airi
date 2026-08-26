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
