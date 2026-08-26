import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type {
  ActionInvocation,
  ExecutionTarget,
  PendingActionRecord,
  PolicyDecision,
  ScreenshotArtifact,
} from '../types'

import { imageContent, textContent } from './content'
import { describeExecutionTarget, describeForegroundContext, describePolicy } from './formatters'

export function buildApprovalResponse(
  pending: PendingActionRecord,
  decision: PolicyDecision,
  context: { appName?: string, available: boolean, windowTitle?: string },
  transparency?: {
    advisorySummary?: string
    approvalReason?: string
    intent?: string
  },
): CallToolResult {
  const baseText = `Approval required for ${pending.action.kind}. Pending action id: ${pending.id}. Context: ${describeForegroundContext(context)}. Policy: ${describePolicy(decision)}.`
  const transparencyText = transparency
    ? `\n\nWhy: ${transparency.approvalReason || 'Policy requires approval for this action.'}\nIntent: ${transparency.intent || pending.action.kind}${transparency.advisorySummary ? `\nStrategy notes: ${transparency.advisorySummary}` : ''}`
    : ''

  return {
    content: [
      textContent(`${baseText}${transparencyText}`),
    ],
    structuredContent: {
      action: pending.action,
      context,
      pendingActionId: pending.id,
      policy: decision,
      status: 'approval_required',
      toolName: pending.toolName,
      transparency: transparency
        ? {
            advisorySummary: transparency.advisorySummary,
            approvalReason: transparency.approvalReason,
            intent: transparency.intent,
          }
        : undefined,
    },
  }
}

export function buildDeniedResponse(decision: PolicyDecision, context: { appName?: string, available: boolean, windowTitle?: string }, executionTarget: ExecutionTarget): CallToolResult {
  return {
    content: [
      textContent(
        `Action denied. Target: ${describeExecutionTarget(executionTarget)}. Context: ${describeForegroundContext(context)}. Reasons: ${decision.reasons.join('; ') || 'policy denied the request'}.`,
      ),
    ],
    isError: true,
    structuredContent: {
      context,
      executionTarget,
      policy: decision,
      status: 'denied',
    },
  }
}

export function buildExecutionErrorResponse(params: {
  action: ActionInvocation
  context: { appName?: string, available: boolean, windowTitle?: string }
  errorMessage: string
  executionTarget: ExecutionTarget
  policy: PolicyDecision
}): CallToolResult {
  return {
    content: [
      textContent(
        `Action ${params.action.kind} failed on ${describeExecutionTarget(params.executionTarget)}: ${params.errorMessage}`,
      ),
    ],
    isError: true,
    structuredContent: {
      action: params.action.kind,
      context: params.context,
      error: params.errorMessage,
      executionTarget: params.executionTarget,
      policy: params.policy,
      status: 'failed',
    },
  }
}

export function buildSuccessResponse(params: {
  screenshot?: ScreenshotArtifact
  structuredContent: Record<string, unknown>
  summary: string
}): CallToolResult {
  return {
    content: [
      textContent(params.summary),
      ...(params.screenshot ? [imageContent(params.screenshot)] : []),
    ],
    structuredContent: params.structuredContent,
  }
}
