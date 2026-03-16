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
  context: { available: boolean, appName?: string, windowTitle?: string },
  transparency?: {
    intent?: string
    approvalReason?: string
    advisorySummary?: string
  },
  internal?: {
    approvalToken?: string
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
    toolResult: internal?.approvalToken
      ? {
          approvalToken: internal.approvalToken,
        }
      : undefined,
    structuredContent: {
      status: 'approval_required',
      pendingActionId: pending.id,
      toolName: pending.toolName,
      action: pending.action,
      policy: decision,
      context,
      transparency: transparency
        ? {
            intent: transparency.intent,
            approvalReason: transparency.approvalReason,
            advisorySummary: transparency.advisorySummary,
          }
        : undefined,
    },
  }
}

export function buildDeniedResponse(decision: PolicyDecision, context: { available: boolean, appName?: string, windowTitle?: string }, executionTarget: ExecutionTarget): CallToolResult {
  return {
    isError: true,
    content: [
      textContent(
        `Action denied. Target: ${describeExecutionTarget(executionTarget)}. Context: ${describeForegroundContext(context)}. Reasons: ${decision.reasons.join('; ') || 'policy denied the request'}.`,
      ),
    ],
    structuredContent: {
      status: 'denied',
      policy: decision,
      context,
      executionTarget,
    },
  }
}

export function buildExecutionErrorResponse(params: {
  errorMessage: string
  action: ActionInvocation
  context: { available: boolean, appName?: string, windowTitle?: string }
  executionTarget: ExecutionTarget
  policy: PolicyDecision
}): CallToolResult {
  return {
    isError: true,
    content: [
      textContent(
        `Action ${params.action.kind} failed on ${describeExecutionTarget(params.executionTarget)}: ${params.errorMessage}`,
      ),
    ],
    structuredContent: {
      status: 'failed',
      action: params.action.kind,
      context: params.context,
      executionTarget: params.executionTarget,
      policy: params.policy,
      error: params.errorMessage,
    },
  }
}

export function buildSuccessResponse(params: {
  summary: string
  screenshot?: ScreenshotArtifact
  structuredContent: Record<string, unknown>
}): CallToolResult {
  return {
    content: [
      textContent(params.summary),
      ...(params.screenshot ? [imageContent(params.screenshot)] : []),
    ],
    structuredContent: params.structuredContent,
  }
}
