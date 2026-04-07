import type { OperationApprovalScope } from './operation-contracts'
import type { TerminalSurface } from './types'
import type { VerificationMethod } from './verification-contracts'

export type LaneKind = 'workflow' | 'browser' | 'desktop-native' | 'handoff' | 'terminal'

export interface LaneHandoffReadiness {
  /**
   * PTY path expectation for this contract.
   * - none: this handoff does not require PTY preconditions
   * - bound_or_acquire: requires an existing PTY session or an acquire callback
   */
  ptyPath: 'none' | 'bound_or_acquire'
  /**
   * If true, the workflow engine may keep legacy outward reroute behavior when
   * a PTY acquire callback is not available.
   */
  allowLegacyReroute: boolean
}

export interface LaneHandoffContract {
  id: string
  lane: LaneKind
  sourceSurface: TerminalSurface
  targetSurface: TerminalSurface
  approvalScope: OperationApprovalScope
  verificationMethod: VerificationMethod
  readiness: LaneHandoffReadiness
  description: string
}

export interface TerminalHandoffReadinessContext {
  boundPtySessionId?: string
  hasAcquirePtyCallback: boolean
}

export interface LaneHandoffReadinessResult {
  ready: boolean
  reason: string
}

export function evaluateTerminalHandoffReadiness(params: {
  contract: Pick<LaneHandoffContract, 'readiness' | 'targetSurface'>
  context: TerminalHandoffReadinessContext
}): LaneHandoffReadinessResult {
  const { contract, context } = params

  if (contract.targetSurface !== 'pty' || contract.readiness.ptyPath === 'none') {
    return {
      ready: true,
      reason: 'handoff does not require PTY preconditions',
    }
  }

  const hasBoundPtySession = Boolean(context.boundPtySessionId)
  if (hasBoundPtySession) {
    return {
      ready: true,
      reason: `bound PTY session ${context.boundPtySessionId} is available`,
    }
  }

  if (context.hasAcquirePtyCallback) {
    return {
      ready: true,
      reason: 'PTY acquire callback is available',
    }
  }

  if (contract.readiness.allowLegacyReroute) {
    return {
      ready: true,
      reason: 'legacy outward reroute is allowed when PTY acquire callback is missing',
    }
  }

  return {
    ready: false,
    reason: 'handoff requires a bound PTY session or an acquire callback',
  }
}
