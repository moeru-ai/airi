import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { PendingExecutableAction } from '../types'

import { randomUUID } from 'node:crypto'

/** The model's proposed action. It contains no policy or execution state. */
export interface ModelDecisionContract {
  kind: 'model_decision'
  decisionId: string
  toolName: string
  action: PendingExecutableAction
  decidedAt: string
}

/** Host or policy authorization. It contains no backend result. */
export interface AuthorizationContract {
  kind: 'authorization'
  status: 'not_required' | 'pending' | 'granted' | 'denied'
  source: 'policy' | 'host'
  authorizationId?: string
  pendingActionId?: string
  reason?: string
}

/** Mechanical dispatch evidence. It contains no business assertion. */
export interface ExecutionContract {
  kind: 'execution'
  executionId: string
  status: 'not_started' | 'delivered' | 'failed' | 'unknown'
  dispatch: 'not_started' | 'accepted' | 'rejected' | 'unknown'
  backend?: string
  doNotReplay: boolean
  reason?: string
}

/** Application-level evidence. It is independent from input delivery. */
export interface BusinessVerificationContract {
  kind: 'business_verification'
  executionId?: string
  status: 'not_run' | 'verified' | 'not_verified' | 'unknown'
  check?: string
  expected?: string
  observed?: unknown
  evidenceRef?: string
  reason?: string
}

export interface AgentExecutionContracts {
  modelDecision: ModelDecisionContract
  authorization: AuthorizationContract
  execution: ExecutionContract
  businessVerification: BusinessVerificationContract
}

function preDispatchContracts(modelDecision: ModelDecisionContract, requiresApproval: boolean, source: 'policy' | 'host'): AgentExecutionContracts {
  return {
    modelDecision,
    authorization: {
      kind: 'authorization',
      status: requiresApproval ? 'pending' : 'not_required',
      source,
      reason: requiresApproval ? 'Authorization is pending.' : 'The configured policy did not require approval.',
    },
    execution: {
      kind: 'execution',
      executionId: randomUUID(),
      status: 'not_started',
      dispatch: 'not_started',
      doNotReplay: false,
    },
    businessVerification: {
      kind: 'business_verification',
      status: 'not_run',
      reason: 'No application state has been verified.',
    },
  }
}

export function buildTraceContracts(params: {
  event: 'requested' | 'approval_required' | 'approved' | 'rejected' | 'executed' | 'denied' | 'failed'
  toolName: string
  action: PendingExecutableAction
  requiresApproval: boolean
  reason?: string
  pendingActionId?: string
  backend?: string
}): AgentExecutionContracts {
  const modelDecision = createModelDecision(params.toolName, params.action)
  if (params.event === 'requested')
    return preDispatchContracts(modelDecision, params.requiresApproval, 'policy')
  if (params.event === 'approval_required') {
    const contracts = preDispatchContracts(modelDecision, true, 'host')
    contracts.authorization.status = 'pending'
    contracts.authorization.pendingActionId = params.pendingActionId
    return contracts
  }
  if (params.event === 'approved') {
    const contracts = preDispatchContracts(modelDecision, true, 'host')
    contracts.authorization.status = 'granted'
    contracts.execution.status = 'not_started'
    contracts.execution.dispatch = 'not_started'
    contracts.execution.reason = 'Host approval completed. Dispatch evidence is recorded by the later execution event.'
    return contracts
  }
  if (params.event === 'rejected' || params.event === 'denied') {
    const contracts = preDispatchContracts(modelDecision, params.requiresApproval, params.requiresApproval ? 'host' : 'policy')
    contracts.authorization.status = 'denied'
    contracts.authorization.reason = params.reason ?? 'Authorization was denied.'
    return contracts
  }
  const contracts = preDispatchContracts(modelDecision, params.requiresApproval, params.requiresApproval ? 'host' : 'policy')
  contracts.authorization.status = params.requiresApproval ? 'granted' : 'not_required'
  contracts.authorization.reason = params.requiresApproval ? 'Host authorization allowed dispatch.' : 'The configured policy did not require approval.'
  contracts.execution = {
    kind: 'execution',
    executionId: randomUUID(),
    status: params.event === 'executed' ? 'delivered' : 'unknown',
    dispatch: params.event === 'executed' ? 'accepted' : 'unknown',
    backend: params.backend,
    doNotReplay: params.event === 'failed',
    reason: params.event === 'executed' ? 'The backend accepted the operation. Business state remains unverified.' : 'The failure leaves dispatch state unknown. Observe before retrying.',
  }
  return contracts
}

export function createModelDecision(toolName: string, action: PendingExecutableAction): ModelDecisionContract {
  return {
    kind: 'model_decision',
    decisionId: randomUUID(),
    toolName,
    action,
    decidedAt: new Date().toISOString(),
  }
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function statusOf(result: CallToolResult) {
  return recordOf(result.structuredContent)?.status
}

export function buildAgentExecutionContracts(params: {
  result: CallToolResult
  modelDecision: ModelDecisionContract
  authorizationSource?: 'policy' | 'host'
}): AgentExecutionContracts {
  const structured = recordOf(params.result.structuredContent)
  const status = statusOf(params.result)
  const policy = recordOf(structured?.policy)
  const requiresApproval = policy?.requiresApproval === true
  const source = params.authorizationSource ?? (requiresApproval ? 'host' : 'policy')
  const backend = typeof structured?.terminalBackend === 'string'
    ? structured.terminalBackend
    : undefined

  let authorization: AuthorizationContract
  let execution: ExecutionContract

  if (status === 'approval_required') {
    authorization = {
      kind: 'authorization',
      status: 'pending',
      source: 'host',
      pendingActionId: typeof structured?.pendingActionId === 'string' ? structured.pendingActionId : undefined,
      reason: 'Host approval is required before dispatch.',
    }
    execution = {
      kind: 'execution',
      executionId: randomUUID(),
      status: 'not_started',
      dispatch: 'not_started',
      doNotReplay: false,
      reason: 'The action is waiting for authorization.',
    }
  }
  else if (status === 'denied') {
    authorization = {
      kind: 'authorization',
      status: 'denied',
      source,
      reason: typeof structured?.error === 'string' ? structured.error : 'The action was denied by policy or Host.',
    }
    execution = {
      kind: 'execution',
      executionId: randomUUID(),
      status: 'not_started',
      dispatch: 'not_started',
      doNotReplay: false,
      reason: 'Authorization did not permit dispatch.',
    }
  }
  else if (status === 'executed') {
    authorization = {
      kind: 'authorization',
      status: requiresApproval ? 'granted' : 'not_required',
      source,
      reason: requiresApproval ? 'Host authorization allowed dispatch.' : 'The configured policy did not require approval.',
    }
    const backendResult = recordOf(structured?.backendResult)
    const deliveryFailed = backendResult?.performed === false
    execution = {
      kind: 'execution',
      executionId: randomUUID(),
      status: deliveryFailed ? 'unknown' : 'delivered',
      dispatch: deliveryFailed ? 'unknown' : 'accepted',
      backend,
      doNotReplay: deliveryFailed,
      reason: deliveryFailed ? 'The backend did not confirm input delivery.' : 'The backend accepted the operation. Business state remains unverified.',
    }
  }
  else if (status === 'failed') {
    authorization = {
      kind: 'authorization',
      status: requiresApproval ? 'granted' : 'not_required',
      source,
      reason: 'Authorization was separate from the failed execution.',
    }
    execution = {
      kind: 'execution',
      executionId: randomUUID(),
      status: 'unknown',
      dispatch: 'unknown',
      backend,
      doNotReplay: true,
      reason: 'The failure does not prove whether dispatch reached the backend. Observe before retrying.',
    }
  }
  else {
    authorization = {
      kind: 'authorization',
      status: 'not_required',
      source: 'policy',
      reason: 'No authorization decision was produced for this response.',
    }
    execution = {
      kind: 'execution',
      executionId: randomUUID(),
      status: 'not_started',
      dispatch: 'not_started',
      doNotReplay: false,
      reason: 'No execution was started.',
    }
  }

  return {
    modelDecision: params.modelDecision,
    authorization,
    execution,
    businessVerification: {
      kind: 'business_verification',
      executionId: execution.executionId,
      status: 'not_run',
      reason: 'Call computer_verify or another application-specific verifier after execution.',
    },
  }
}

/** Add separate contract fields without changing the legacy response fields. */
export function attachAgentExecutionContracts(
  result: CallToolResult,
  contracts: AgentExecutionContracts,
): CallToolResult {
  const structured = recordOf(result.structuredContent) ?? {}
  return {
    ...result,
    structuredContent: {
      ...structured,
      modelDecision: contracts.modelDecision,
      authorization: contracts.authorization,
      execution: contracts.execution,
      businessVerification: contracts.businessVerification,
    },
  }
}

export function attachBusinessVerificationContract(
  result: CallToolResult,
  verification: BusinessVerificationContract,
): CallToolResult {
  const structured = recordOf(result.structuredContent) ?? {}
  return {
    ...result,
    structuredContent: {
      ...structured,
      businessVerification: verification,
    },
  }
}
