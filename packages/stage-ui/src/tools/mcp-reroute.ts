/**
 * Centralized parser for workflow reroute instructions from MCP
 * structured content.
 *
 * All call sites that need to detect or consume reroute signals MUST
 * use this module. Do NOT check `status === 'reroute_required'`
 * directly in other files.
 */

import type { McpCallToolResult } from '../stores/mcp-tool-bridge'

// ---------------------------------------------------------------------------
// Reroute contract types (mirrors computer-use-mcp/reroute-contract.ts)
// ---------------------------------------------------------------------------

export interface WorkflowRerouteDetail {
  recommendedSurface: string
  suggestedTool: string
  strategyReason: string
  executionReason?: string
  explanation: string
  availableSurfaces?: string[]
  preferredSurface?: string
  terminalSurface?: string
  ptySessionId?: string
}

export interface WorkflowRerouteInstruction {
  kind: 'workflow_reroute'
  status: 'reroute_required'
  workflow: string
  reroute: WorkflowRerouteDetail
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Extract a workflow reroute instruction from an MCP tool result.
 * Returns `undefined` if the result is not a reroute.
 */
export function extractWorkflowReroute(result: McpCallToolResult): WorkflowRerouteInstruction | undefined {
  const sc = result.structuredContent
  if (!sc || typeof sc !== 'object') {
    return undefined
  }

  const record = sc as Record<string, unknown>

  if (record.kind !== 'workflow_reroute' || record.status !== 'reroute_required') {
    return undefined
  }

  const reroute = record.reroute
  if (!reroute || typeof reroute !== 'object') {
    return undefined
  }

  const detail = reroute as Record<string, unknown>

  return {
    kind: 'workflow_reroute',
    status: 'reroute_required',
    workflow: typeof record.workflow === 'string' ? record.workflow : 'unknown',
    reroute: {
      recommendedSurface: String(detail.recommendedSurface ?? 'unknown'),
      suggestedTool: String(detail.suggestedTool ?? 'unknown'),
      strategyReason: String(detail.strategyReason ?? ''),
      ...(typeof detail.executionReason === 'string' ? { executionReason: detail.executionReason } : {}),
      explanation: String(detail.explanation ?? ''),
      ...(Array.isArray(detail.availableSurfaces) ? { availableSurfaces: detail.availableSurfaces.map(String) } : {}),
      ...(typeof detail.preferredSurface === 'string' ? { preferredSurface: detail.preferredSurface } : {}),
      ...(typeof detail.terminalSurface === 'string' ? { terminalSurface: detail.terminalSurface } : {}),
      ...(typeof detail.ptySessionId === 'string' ? { ptySessionId: detail.ptySessionId } : {}),
    },
  }
}

/**
 * Quick predicate: is this MCP result a workflow reroute?
 */
export function isWorkflowReroute(result: McpCallToolResult): boolean {
  return extractWorkflowReroute(result) !== undefined
}
