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

/** Keeps desktop environment metadata separate from Terminal execution and directory facts. */
export function describeTerminalBackend(backend: string) {
  return `Terminal backend: ${backend}. executionTarget and context describe the desktop backend. Desktop dry-run does not establish whether a Terminal command executed. For terminal_exec, backendResult.effectiveCwd is the directory used to spawn this command. terminalState.effectiveCwd is the default directory for a later command. Neither field tracks an interactive Shell directory.`
}

export function summarizeCoordinateSpace(info: CoordinateSpaceInfo) {
  if (info.aligned === true)
    return 'aligned'
  if (info.aligned === false)
    return 'mismatch'
  return 'unknown'
}
