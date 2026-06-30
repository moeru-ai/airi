export const CODING_MODES = ['ask', 'spec', 'code', 'debug'] as const
export type CodingMode = (typeof CODING_MODES)[number]

export const SPEC_ENTRY_PATHS = ['requirements-first', 'design-first', 'quick-spec'] as const
export type SpecEntryPath = (typeof SPEC_ENTRY_PATHS)[number]

export const SPEC_PHASES = ['requirements', 'design', 'tasks'] as const
export type SpecPhase = (typeof SPEC_PHASES)[number]

export const SPEC_ARTIFACT_NAMES = ['requirements.md', 'design.md', 'tasks.md'] as const
export type SpecArtifactName = (typeof SPEC_ARTIFACT_NAMES)[number]

export const CODING_ENGINE_IDS = ['native', 'acp:pi', 'acp:codex'] as const
export type CodingEngineId = (typeof CODING_ENGINE_IDS)[number]

export const V1_CODING_ENGINE_IDS = ['native'] as const
export type V1CodingEngineId = (typeof V1_CODING_ENGINE_IDS)[number]

export const SUBAGENT_JOB_STATUSES = ['queued', 'running', 'blocked', 'completed', 'failed', 'cancelled'] as const
export type SubagentJobStatus = (typeof SUBAGENT_JOB_STATUSES)[number]

export const SUBAGENT_JOB_PHASES = ['requirements', 'design', 'tasks', 'implementation'] as const
export type SubagentJobPhase = (typeof SUBAGENT_JOB_PHASES)[number]

export const MCP_BACKEND_STATES = ['unavailable', 'available', 'serena'] as const
export type McpBackendState = (typeof MCP_BACKEND_STATES)[number]

export const SERENA_READ_ONLY_TOOL_NAMES = [
  'get_symbols_overview',
  'find_symbol',
  'find_declaration',
  'find_referencing_symbols',
  'get_diagnostics_for_file',
  'search_for_pattern',
] as const
export type SerenaToolName = (typeof SERENA_READ_ONLY_TOOL_NAMES)[number]

export interface SubagentJobInput {
  kind: string
  label?: string
  value: unknown
}

export interface SubagentJobOutput {
  kind: string
  label?: string
  value: unknown
}

export interface SubagentJobProvenance {
  source: 'user' | 'workspace' | 'mcp' | 'serena' | 'agent'
  backend?: McpBackendState
  serverName?: string
  toolName?: string
  reference?: string
  metadata?: Record<string, unknown>
}

export interface SubagentJobRecord {
  phase: SubagentJobPhase
  taskDescription: string
  engine: CodingEngineId
  status: SubagentJobStatus
  inputs: SubagentJobInput[]
  outputs: SubagentJobOutput[]
  provenance: SubagentJobProvenance[]
}

const specArtifactByPhase = {
  requirements: 'requirements.md',
  design: 'design.md',
  tasks: 'tasks.md',
} as const satisfies Record<SpecPhase, SpecArtifactName>

const nextPhaseByPhase = {
  requirements: 'design',
  design: 'tasks',
  tasks: undefined,
} as const satisfies Record<SpecPhase, SpecPhase | undefined>

export function isSpecMode(mode: CodingMode): boolean {
  return mode === 'spec'
}

export function isV1Engine(engine: CodingEngineId): boolean {
  return engine === 'native'
}

export function artifactNameForPhase(phase: SpecPhase): SpecArtifactName {
  return specArtifactByPhase[phase]
}

export function nextSpecPhase(phase: SpecPhase): SpecPhase | undefined {
  return nextPhaseByPhase[phase]
}

export function isSerenaReadOnlyTool(toolName: string): toolName is SerenaToolName {
  return (SERENA_READ_ONLY_TOOL_NAMES as readonly string[]).includes(toolName)
}
