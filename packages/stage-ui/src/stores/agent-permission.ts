/**
 * Risk classification for agent tool calls.
 *
 * The chat runtime hands every tool to the model, and the model calls a tool
 * directly inside the stream. This module reads the risk of such a call. The
 * policy that acts on the risk lives in
 * `stores/ai/chat-llm/agent-gate.ts`.
 *
 * Three levels exist:
 *
 * - `LOW` reads state. The call always runs.
 * - `MEDIUM` changes state inside AIRI. The user chooses whether to confirm.
 * - `HIGH` changes the machine. The user confirms every call, unless full
 *   access is on.
 *
 * A tool that the table does not name is `HIGH`. An unknown tool must ask first.
 */

export const RISK = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
} as const

export type RiskLevel = (typeof RISK)[keyof typeof RISK]

export const RISK_ORDER: RiskLevel[] = [RISK.LOW, RISK.MEDIUM, RISK.HIGH]

export function isRiskLevel(value: unknown): value is RiskLevel {
  return typeof value === 'string' && (RISK_ORDER as string[]).includes(value)
}

/**
 * Tool names with a known risk.
 *
 * The names come from the tool definitions in this repository. A tool that the
 * table does not name falls back to {@link fragmentRisk}, and then to `HIGH`.
 */
export const TOOL_RISK: Record<string, RiskLevel> = {
  // Reading tools never change the machine.
  builtIn_mcpListTools: RISK.LOW,
  builtIn_debugRandomNumber: RISK.LOW,
  builtIn_sparkNoResponse: RISK.LOW,
  web_search: RISK.LOW,
  computer_use_read_image: RISK.LOW,
  home_assistant_list_entities: RISK.LOW,
  home_assistant_get_state: RISK.LOW,
  get_weather: RISK.LOW,

  // A tool that changes what a module or a home device does next.
  builtIn_emitSparkCommand: RISK.MEDIUM,
  builtIn_sparkCommand: RISK.MEDIUM,

  // The MCP proxy reaches any server, and the tool name arrives per call.
  builtIn_mcpCallTool: RISK.HIGH,
  // The desktop tool runs the AUV CLI. Its own name does not state the command,
  // so `computer_use` reads the subcommand instead. See {@link classifyToolRisk}.
  home_assistant_call_service: RISK.HIGH,
  image_journal: RISK.HIGH,
}

/** A snake_case segment that marks a read-only tool. */
const LOW_SEGMENTS = new Set([
  'list',
  'read',
  'search',
  'get',
  'status',
  'state',
  'screenshot',
  'capture',
  'describe',
  'find',
  'query',
  'inspect',
  'enumerate',
  'probe',
  'weather',
])

/** A snake_case segment that marks a tool which changes the machine. */
const HIGH_SEGMENTS = new Set([
  'click',
  'type',
  'press',
  'key',
  'keyboard',
  'mouse',
  'drag',
  'scroll',
  'write',
  'delete',
  'remove',
  'move',
  'rename',
  'exec',
  'shell',
  'command',
  'spawn',
  'run',
  'kill',
  'install',
  'launch',
  'open',
  'navigate',
  'focus',
  'clipboard',
  'upload',
  'submit',
  'call',
  'service',
  'journal',
])

/**
 * Splits a tool name into its snake_case segments.
 *
 * The match works on whole segments, never on a substring. A substring match
 * reads `stage_widgets` as a read tool, because that name contains `get`.
 */
function segmentsOf(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(part => part.length > 0)
}

function fragmentRisk(name: string): RiskLevel | undefined {
  const segments = segmentsOf(name)
  // A high-risk segment wins. `read_and_write_file` must not pass as a read.
  if (segments.some(segment => HIGH_SEGMENTS.has(segment)))
    return RISK.HIGH
  if (segments.some(segment => LOW_SEGMENTS.has(segment)))
    return RISK.LOW
  return undefined
}

/**
 * Reads the inner tool name from an MCP proxy call.
 *
 * `builtIn_mcpCallTool` takes a flat `name` field in the
 * `"<serverName>::<toolName>"` form. Other tools get `undefined`, so the caller
 * falls back to the outer name.
 */
export function innerToolName(toolName: string, args?: Record<string, unknown>): string | undefined {
  if (toolName !== 'builtIn_mcpCallTool')
    return undefined

  const name = args?.name
  return typeof name === 'string' && name.length > 0 ? name : undefined
}

/** Reads the risk of one AUV subcommand, such as `invoke display.screenshot`. */
function computerUseRisk(args?: Record<string, unknown>): RiskLevel {
  const argv = args?.argv
  if (!Array.isArray(argv))
    return RISK.HIGH

  const subcommand = argv.find(part => typeof part === 'string' && part.includes('.'))
  if (typeof subcommand !== 'string')
    return RISK.HIGH

  // `probePermissions` reads a permission state. The rest of `app.*` changes it.
  if (subcommand === 'app.probePermissions')
    return RISK.LOW

  return fragmentRisk(subcommand) === RISK.LOW ? RISK.LOW : RISK.HIGH
}

/**
 * Classifies one tool call.
 *
 * The outer name takes priority, because the proxy tool owns its own risk. The
 * inner MCP name refines the result when the outer name is the proxy.
 */
export function classifyToolRisk(toolName: string, args?: Record<string, unknown>): RiskLevel {
  if (toolName === 'computer_use')
    return computerUseRisk(args)

  const inner = innerToolName(toolName, args)
  if (inner !== undefined) {
    const exact = TOOL_RISK[inner]
    if (exact !== undefined)
      return exact
    return fragmentRisk(inner) ?? RISK.HIGH
  }

  const exact = TOOL_RISK[toolName]
  if (exact !== undefined)
    return exact

  return fragmentRisk(toolName) ?? RISK.HIGH
}

function clip(value: unknown, limit: number): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

/**
 * Writes one human sentence about the pending call.
 *
 * The dialog shows this text. It holds the important argument only, because a
 * full argument dump is unreadable.
 */
export function describeApproval(toolName: string, args?: Record<string, unknown>): string {
  const inner = innerToolName(toolName, args)
  if (inner !== undefined)
    return `${inner} ${clip(JSON.stringify(args?.arguments ?? {}), 200)}`

  const a = args ?? {}
  switch (toolName) {
    case 'builtIn_emitSparkCommand':
      return `spark:command ${clip(a.intent ?? a.commandId, 120)}`
    default:
      return `${toolName} ${clip(JSON.stringify(a), 200)}`
  }
}
