import type { ElectronMcpCallToolPayload, ElectronMcpCallToolResult } from '../../shared/eventa'

import { normalizeQualifiedMcpToolName } from '@proj-airi/stage-ui/stores/mcp-tool-bridge'

function extractStructuredServerName(result?: ElectronMcpCallToolResult): string | undefined {
  const structuredContent = result?.structuredContent
  if (!structuredContent || typeof structuredContent !== 'object')
    return undefined

  const resolvedServerName = (structuredContent as Record<string, unknown>).resolvedServerName
  return typeof resolvedServerName === 'string' ? resolvedServerName : undefined
}

function extractStructuredToolName(result?: ElectronMcpCallToolResult): string | undefined {
  const structuredContent = result?.structuredContent
  if (!structuredContent || typeof structuredContent !== 'object')
    return undefined

  const resolvedToolName = (structuredContent as Record<string, unknown>).resolvedToolName
  return typeof resolvedToolName === 'string' ? resolvedToolName : undefined
}

function extractRequestedServerName(payload?: Pick<ElectronMcpCallToolPayload, 'name'>): string | undefined {
  const normalizedName = typeof payload?.name === 'string'
    ? normalizeQualifiedMcpToolName(payload.name)
    : ''
  const separatorIndex = normalizedName.indexOf('::')
  if (separatorIndex <= 0)
    return undefined

  return normalizedName.slice(0, separatorIndex)
}

function extractRequestedToolName(payload?: Pick<ElectronMcpCallToolPayload, 'name'>): string | undefined {
  const normalizedName = typeof payload?.name === 'string'
    ? normalizeQualifiedMcpToolName(payload.name)
    : ''
  const separatorIndex = normalizedName.indexOf('::')
  if (separatorIndex <= 0 || separatorIndex >= normalizedName.length - 2)
    return undefined

  return normalizedName.slice(separatorIndex + 2)
}

export function resolveMcpCallServerName(
  payload?: Pick<ElectronMcpCallToolPayload, 'name'>,
  result?: ElectronMcpCallToolResult,
): string | undefined {
  return result?.resolvedServerName
    ?? extractStructuredServerName(result)
    ?? extractRequestedServerName(payload)
}

export function resolveMcpCallToolName(
  payload?: Pick<ElectronMcpCallToolPayload, 'name'>,
  result?: ElectronMcpCallToolResult,
): string | undefined {
  return result?.resolvedToolName
    ?? extractStructuredToolName(result)
    ?? extractRequestedToolName(payload)
}

export function isComputerUseMcpCall(
  payload?: Pick<ElectronMcpCallToolPayload, 'name'>,
  result?: ElectronMcpCallToolResult,
): boolean {
  return resolveMcpCallServerName(payload, result) === 'computer_use'
}
