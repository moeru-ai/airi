export type ComputerUseApprovalGrantScope = 'terminal_and_apps' | 'pty_session'

export interface ComputerUseApprovalGrant {
  scope: ComputerUseApprovalGrantScope
}

const TERMINAL_AND_APP_ACTION_KINDS = new Set([
  'terminal_exec',
  'open_app',
  'focus_app',
])

export function getSessionScopedApprovalGrantScope(actionKind: string | undefined): ComputerUseApprovalGrantScope | undefined {
  if (!actionKind)
    return undefined

  if (TERMINAL_AND_APP_ACTION_KINDS.has(actionKind))
    return 'terminal_and_apps'

  if (actionKind === 'pty_create')
    return 'pty_session'

  return undefined
}

export function canAutoApproveComputerUseAction(
  actionKind: string | undefined,
  grant: ComputerUseApprovalGrant | undefined,
) {
  if (!actionKind || !grant)
    return false

  const scope = getSessionScopedApprovalGrantScope(actionKind)

  // NOTICE: terminal_and_apps keeps the original "session-scoped auto-approve"
  // behavior. PTY creation intentionally does not auto-approve across the
  // approval session; every new PTY creation still requires an explicit grant.
  return scope === 'terminal_and_apps' && grant.scope === 'terminal_and_apps'
}

export function patchComputerUseTerminalStateWithGrant(result: any, grant?: ComputerUseApprovalGrant) {
  if (!result || typeof result !== 'object')
    return result

  const structuredContent = result.structuredContent
  if (!structuredContent || typeof structuredContent !== 'object')
    return result

  const terminalState = structuredContent.terminalState
  if (!terminalState || typeof terminalState !== 'object')
    return result

  return {
    ...result,
    structuredContent: {
      ...structuredContent,
      terminalState: {
        ...terminalState,
        approvalSessionActive: Boolean(grant),
        approvalGrantedScope: grant?.scope ?? terminalState.approvalGrantedScope,
      },
    },
  }
}
