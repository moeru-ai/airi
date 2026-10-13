import type { Tool } from '@xsai/shared-chat'

import type { RiskLevel } from '../../agent-permission'

import { classifyToolRisk, RISK } from '../../agent-permission'
import { useAgentPermissionStore } from '../../agent-permissions'

/** The outcome of a permission decision. */
export const DECISION = {
  ALLOW: 'allow',
  ASK: 'ask',
} as const

export type Decision = (typeof DECISION)[keyof typeof DECISION]

/** The permission settings that the user controls. */
export interface PermissionConfig {
  /** When true, a medium-risk call runs without a confirmation. */
  autoApproveMedium: boolean
  /** When true, every call runs without a confirmation. */
  fullAccess: boolean
}

export const DEFAULT_PERMISSION_CONFIG: PermissionConfig = {
  autoApproveMedium: false,
  fullAccess: false,
}

export function normalizePermissionConfig(raw?: Partial<PermissionConfig> | null): PermissionConfig {
  return {
    autoApproveMedium: raw?.autoApproveMedium === true,
    fullAccess: raw?.fullAccess === true,
  }
}

/**
 * Decides what happens to one call.
 *
 * Full access allows every level. The user turns it on through a separate
 * confirmation, so this function stays a pure decision.
 */
export function decide(riskLevel: RiskLevel, config: PermissionConfig): Decision {
  if (config.fullAccess)
    return DECISION.ALLOW
  if (riskLevel === RISK.LOW)
    return DECISION.ALLOW
  if (riskLevel === RISK.MEDIUM && config.autoApproveMedium)
    return DECISION.ALLOW
  return DECISION.ASK
}

/**
 * The permission policy in force.
 *
 * The settings live at module scope, so a decision needs no Pinia instance. The
 * panel writes them through {@link configureToolGate}, and a tool executed
 * outside a mounted app still reads the last configuration.
 */
let config: PermissionConfig = normalizePermissionConfig(undefined)

export function configureToolGate(next?: Partial<PermissionConfig>): PermissionConfig {
  config = normalizePermissionConfig(next)
  return config
}

export function toolGateConfig(): PermissionConfig {
  return config
}

/** The tool calls that the user chose to allow for the rest of this page load. */
const sessionGrants = new Set<string>()

function grantKey(toolName: string, riskLevel: RiskLevel): string {
  return `${toolName}::${riskLevel}`
}

export function grantSessionTool(toolName: string, riskLevel: RiskLevel): void {
  sessionGrants.add(grantKey(toolName, riskLevel))
}

export function resetToolGrants(): void {
  sessionGrants.clear()
}

/** The decision for one call, without any user interaction. */
export function decideToolCall(toolName: string, args?: Record<string, unknown>): { riskLevel: RiskLevel, decision: Decision } {
  const riskLevel = classifyToolRisk(toolName, args)
  const decision = decide(riskLevel, config)

  // A grant belongs to this page load only. A high-risk call stays confirmable
  // after a medium-risk grant, because the two calls are not equivalent.
  if (decision === DECISION.ASK && riskLevel === RISK.MEDIUM && sessionGrants.has(grantKey(toolName, riskLevel)))
    return { riskLevel, decision: DECISION.ALLOW }

  return { riskLevel, decision }
}

function asArguments(input: unknown): Record<string, unknown> | undefined {
  if (input == null || typeof input !== 'object' || Array.isArray(input))
    return undefined
  return input as Record<string, unknown>
}

/**
 * Wraps one tool so that every call passes the permission gate first.
 *
 * The chat runtime hands the model a flat tool list, and xsAI calls
 * `tool.execute` directly inside the stream. Wrapping `execute` here is
 * therefore the single point that sees every call.
 *
 * A denied call returns a refusal sentence in place of the tool result. The
 * model reads that sentence and answers the user instead of retrying.
 */
export function withPermissionGate(tool: Tool): Tool {
  const original = tool.execute.bind(tool)

  return {
    ...tool,
    async execute(input, options) {
      const toolName = tool.function.name
      const args = asArguments(input)
      const { riskLevel, decision } = decideToolCall(toolName, args)
      if (decision === DECISION.ALLOW)
        return await original(input, options)

      const permissions = useAgentPermissionStore()
      const outcome = await permissions.requestApproval(toolName, args, riskLevel)
      if (outcome.approved) {
        if (outcome.remember)
          grantSessionTool(toolName, riskLevel)
        return await original(input, options)
      }

      return `[permission] The user denied the call to "${toolName}". Do not retry it. Tell the user what you cannot do, or offer another approach.`
    },
  }
}
