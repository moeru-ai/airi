import type { Tool } from '@xsai/shared-chat'

import type {
  CodeIntelligenceFacade,
  WorkspaceDiagnosticsInput,
  WorkspaceRankedContextInput,
  WorkspaceSearchPatternInput,
  WorkspaceSymbolQueryInput,
  WorkspaceSymbolsOverviewInput,
} from '../code-intelligence'
import type {
  CodingMode,
  McpBackendState,
  SpecArtifactName,
  SubagentJobInput,
  SubagentJobOutput,
  SubagentJobProvenance,
  SubagentJobStatus,
} from '../contracts'

import type { SpecModeState } from '../spec-mode'
import type { SubagentJobId, SubagentJobStore } from '../subagents'
import { tool } from '@xsai/tool'
import { z } from 'zod'
import { validateSpecModeWritePath } from '../spec-mode'
import { createSubagentJob, transitionSubagentJob } from '../subagents'

export const CODING_WORKSPACE_TOOL_NAMES = [
  'workspace_status',
  'workspace_get_symbols_overview',
  'workspace_find_symbol',
  'workspace_find_declaration',
  'workspace_find_references',
  'workspace_get_diagnostics',
  'workspace_search_pattern',
  'workspace_ranked_context',
  'workspace_update_spec_artifact',
  'workspace_create_subagent_job',
  'workspace_update_subagent_job',
] as const

export type CodingWorkspaceToolName = (typeof CODING_WORKSPACE_TOOL_NAMES)[number]

export const CODING_WORKSPACE_PROMPT_CONTRIBUTION_IDS = [
  'coding-workspace.ask',
  'coding-workspace.spec',
  'coding-workspace.code',
  'coding-workspace.debug',
] as const

export type CodingWorkspacePromptContributionId = (typeof CODING_WORKSPACE_PROMPT_CONTRIBUTION_IDS)[number]

export interface CodingWorkspacePromptContribution {
  id: CodingWorkspacePromptContributionId
  title: string
  content: string
}

export interface CodingWorkspaceStatus {
  mode: CodingMode
  workspaceRoot?: string
  mcpBackend?: McpBackendState
  activeFeatureSlug?: string
  [key: string]: unknown
}

export interface UpdateSpecArtifactInput {
  state: SpecModeState
  artifactName: SpecArtifactName
  path: string
  content: string
  updateKind: 'replace' | 'append'
}

export interface CodingWorkspaceToolRuntime {
  codeIntelligence: CodeIntelligenceFacade
  getMode: () => CodingMode
  getStatus?: () => CodingWorkspaceStatus | Promise<CodingWorkspaceStatus>
  getSpecModeState: () => SpecModeState | undefined
  updateSpecArtifact: (input: UpdateSpecArtifactInput) => Promise<unknown> | unknown
  getSubagentStore: () => SubagentJobStore
  setSubagentStore: (store: SubagentJobStore) => void
}

interface ToolFailure {
  ok: false
  reason: string
  message: string
}

const codeIntelligenceModes = ['ask', 'spec', 'code', 'debug'] as const satisfies readonly CodingMode[]
const specMutationModes = ['spec', 'code'] as const satisfies readonly CodingMode[]
const subagentMutationModes = ['spec', 'code', 'debug'] as const satisfies readonly CodingMode[]

const workspaceFileSchema = {
  filePath: z.string().optional(),
  relativePath: z.string().optional(),
  rootPath: z.string().optional(),
} as const

const symbolQuerySchema = z
  .object({
    ...workspaceFileSchema,
    query: z.string(),
    namePath: z.string().optional(),
    includeBody: z.boolean().optional(),
    substringMatching: z.boolean().optional(),
    limit: z.number().int().positive().optional(),
  })
  .strict()

const diagnosticsSchema = z
  .object({
    ...workspaceFileSchema,
  })
  .strict()

const searchPatternSchema = z
  .object({
    ...workspaceFileSchema,
    query: z.string().optional(),
    pattern: z.string().optional(),
    include: z.array(z.string()).optional(),
    limit: z.number().int().positive().optional(),
  })
  .strict()

const rankedContextSchema = z
  .object({
    ...workspaceFileSchema,
    query: z.string(),
    includeDiagnostics: z.boolean().optional(),
    limit: z.number().int().positive().optional(),
  })
  .strict()

const specArtifactUpdateSchema = z
  .object({
    artifactName: z.enum(['requirements.md', 'design.md', 'tasks.md']),
    path: z.string().optional(),
    content: z.string(),
    updateKind: z.enum(['replace', 'append']).optional(),
  })
  .strict()

const createSubagentJobSchema = z
  .object({
    phase: z.enum(['requirements', 'design', 'tasks', 'implementation']),
    taskDescription: z.string(),
    engine: z.enum(['native', 'acp:pi', 'acp:codex']).optional(),
    inputsJson: z.string().optional(),
    outputsJson: z.string().optional(),
    provenanceJson: z.string().optional(),
  })
  .strict()

const updateSubagentJobSchema = z
  .object({
    jobId: z.string(),
    status: z.enum(['queued', 'running', 'blocked', 'completed', 'failed', 'cancelled']).optional(),
    outputJson: z.string().optional(),
    provenanceJson: z.string().optional(),
  })
  .strict()

export async function createCodingWorkspaceTools(runtime: CodingWorkspaceToolRuntime): Promise<Tool[]> {
  return await Promise.all([
    tool({
      name: 'workspace_status',
      description: 'Return the active coding workspace mode, workspace root, MCP backend, and feature spec status.',
      parameters: z.object({}).strict(),
      execute: async () =>
        await executeAllowed(runtime, codeIntelligenceModes, async () => {
          return (
            (await runtime.getStatus?.()) ?? {
              mode: runtime.getMode(),
              activeFeatureSlug: runtime.getSpecModeState()?.activeFeatureSlug,
            }
          )
        }),
    }),
    tool({
      name: 'workspace_get_symbols_overview',
      description:
        'Inspect a file or directory and return a semantic overview of symbols when code intelligence is available.',
      parameters: diagnosticsSchema,
      execute: async (input) =>
        await executeAllowed(runtime, codeIntelligenceModes, async () => {
          return await runtime.codeIntelligence.workspace_get_symbols_overview(input as WorkspaceSymbolsOverviewInput)
        }),
    }),
    tool({
      name: 'workspace_find_symbol',
      description:
        'Find symbols by name or query through the injected code intelligence facade, preferring Serena when available.',
      parameters: symbolQuerySchema,
      execute: async (input) =>
        await executeAllowed(runtime, codeIntelligenceModes, async () => {
          return await runtime.codeIntelligence.workspace_find_symbol(input as WorkspaceSymbolQueryInput)
        }),
    }),
    tool({
      name: 'workspace_find_declaration',
      description: 'Find the declaration for a symbol through the injected code intelligence facade.',
      parameters: symbolQuerySchema,
      execute: async (input) =>
        await executeAllowed(runtime, codeIntelligenceModes, async () => {
          return await runtime.codeIntelligence.workspace_find_declaration(input as WorkspaceSymbolQueryInput)
        }),
    }),
    tool({
      name: 'workspace_find_references',
      description: 'Find references for a symbol through the injected code intelligence facade.',
      parameters: symbolQuerySchema,
      execute: async (input) =>
        await executeAllowed(runtime, codeIntelligenceModes, async () => {
          return await runtime.codeIntelligence.workspace_find_references(input as WorkspaceSymbolQueryInput)
        }),
    }),
    tool({
      name: 'workspace_get_diagnostics',
      description: 'Get diagnostics for a workspace file through the injected code intelligence facade.',
      parameters: diagnosticsSchema,
      execute: async (input) =>
        await executeAllowed(runtime, codeIntelligenceModes, async () => {
          return await runtime.codeIntelligence.workspace_get_diagnostics(input as WorkspaceDiagnosticsInput)
        }),
    }),
    tool({
      name: 'workspace_search_pattern',
      description: 'Search source text or semantic pattern matches through the injected code intelligence facade.',
      parameters: searchPatternSchema,
      execute: async (input) =>
        await executeAllowed(runtime, codeIntelligenceModes, async () => {
          return await runtime.codeIntelligence.workspace_search_pattern(input as WorkspaceSearchPatternInput)
        }),
    }),
    tool({
      name: 'workspace_ranked_context',
      description: 'Collect ranked code context for a query through the injected code intelligence facade.',
      parameters: rankedContextSchema,
      execute: async (input) =>
        await executeAllowed(runtime, codeIntelligenceModes, async () => {
          return await runtime.codeIntelligence.workspace_ranked_context(input as WorkspaceRankedContextInput)
        }),
    }),
    tool({
      name: 'workspace_update_spec_artifact',
      description: 'Update a canonical Spec mode artifact after validating the path with the Spec mode model.',
      parameters: specArtifactUpdateSchema,
      execute: async (input) =>
        await executeAllowed(runtime, specMutationModes, async () => {
          const state = runtime.getSpecModeState()
          if (!state) {
            return failure('spec-state-unavailable', 'No active Spec mode state is available.')
          }

          const path = input.path ?? state.allowedArtifactPaths[input.artifactName]
          const writeDecision = validateSpecModeWritePath(state, path)
          if (!writeDecision.allowed) {
            return failure(writeDecision.reason, `Spec mode cannot write "${path}".`)
          }

          const result = await runtime.updateSpecArtifact({
            state,
            artifactName: input.artifactName,
            path: writeDecision.normalizedPath,
            content: input.content,
            updateKind: input.updateKind ?? 'replace',
          })

          return {
            ok: true,
            artifactName: input.artifactName,
            path: writeDecision.normalizedPath,
            result,
          }
        }),
    }),
    tool({
      name: 'workspace_create_subagent_job',
      description: 'Create a native async subagent job through the subagent job model.',
      parameters: createSubagentJobSchema,
      execute: async (input) =>
        await executeAllowed(runtime, subagentMutationModes, async () => {
          const mutation = createSubagentJob(runtime.getSubagentStore(), {
            phase: input.phase,
            taskDescription: input.taskDescription,
            engine: input.engine,
            inputs: parseJsonArray<SubagentJobInput>(input.inputsJson, 'inputsJson'),
            outputs: parseJsonArray<SubagentJobOutput>(input.outputsJson, 'outputsJson'),
            provenance: parseJsonArray<SubagentJobProvenance>(input.provenanceJson, 'provenanceJson'),
          })
          runtime.setSubagentStore(mutation.store)

          return {
            ok: true,
            jobId: mutation.jobId,
            job: mutation.job,
          }
        }),
    }),
    tool({
      name: 'workspace_update_subagent_job',
      description:
        'Transition a subagent job and optionally attach output and provenance through the subagent job model.',
      parameters: updateSubagentJobSchema,
      execute: async (input) =>
        await executeAllowed(runtime, subagentMutationModes, async () => {
          const status = input.status ?? runtime.getSubagentStore().jobs[input.jobId as SubagentJobId]?.status
          if (!status) {
            return failure('job-status-required', 'Provide status when the subagent job cannot be found.')
          }

          const mutation = transitionSubagentJob(
            runtime.getSubagentStore(),
            input.jobId as SubagentJobId,
            status as SubagentJobStatus,
            {
              output: parseOptionalJson<SubagentJobOutput>(input.outputJson, 'outputJson'),
              provenance: parseOptionalJson<SubagentJobProvenance>(input.provenanceJson, 'provenanceJson'),
            },
          )
          runtime.setSubagentStore(mutation.store)

          return {
            ok: true,
            jobId: mutation.jobId,
            job: mutation.job,
          }
        }),
    }),
  ])
}

export function createCodingWorkspaceToolsetPrompts(): CodingWorkspacePromptContribution[] {
  return [
    {
      id: 'coding-workspace.ask',
      title: 'Coding Workspace Ask',
      content:
        'Ask mode is for code questions and inspection. Use workspace_status and read-only workspace code-intelligence tools to answer from the current codebase. Do not create subagent jobs or request source edits in Ask mode.',
    },
    {
      id: 'coding-workspace.spec',
      title: 'Coding Workspace Spec',
      content:
        'Spec mode plans changes through docs/specs/<feature-slug>/requirements.md, design.md, and tasks.md. Use workspace_update_spec_artifact only for canonical spec artifacts in the active feature spec directory. In Spec mode, source edits are blocked and implementation must wait for approved tasks.',
    },
    {
      id: 'coding-workspace.code',
      title: 'Coding Workspace Code',
      content:
        'Code mode is for implementation after the plan is clear. Use code-intelligence tools for targeted context, keep subagent jobs tied to approved tasks, and preserve AIRI ownership of edits, approvals, and command policy.',
    },
    {
      id: 'coding-workspace.debug',
      title: 'Coding Workspace Debug',
      content:
        'Debug mode investigates failures and verifies hypotheses. Prefer diagnostics, references, ranked context, and focused subagent status updates before proposing edits.',
    },
  ]
}

async function executeAllowed<Result>(
  runtime: CodingWorkspaceToolRuntime,
  allowedModes: readonly CodingMode[],
  execute: () => Promise<Result> | Result,
): Promise<Result | ToolFailure> {
  const mode = runtime.getMode()

  if (!allowedModes.includes(mode)) {
    return failure('mode-not-allowed', `Tool is not available in "${mode}" mode.`)
  }

  try {
    return await execute()
  } catch (error) {
    return failure('tool-execution-failed', error instanceof Error ? error.message : String(error))
  }
}

function failure(reason: string, message: string): ToolFailure {
  return {
    ok: false,
    reason,
    message,
  }
}

function parseJsonArray<Item>(json: string | undefined, fieldName: string): Item[] | undefined {
  if (json == null || json.trim().length === 0) return undefined

  const value = parseJson(json, fieldName)
  if (!Array.isArray(value)) throw new Error(`${fieldName} must be a JSON array.`)

  return value as Item[]
}

function parseOptionalJson<Value>(json: string | undefined, fieldName: string): Value | undefined {
  if (json == null || json.trim().length === 0) return undefined

  return parseJson(json, fieldName) as Value
}

function parseJson(json: string, fieldName: string): unknown {
  try {
    return JSON.parse(json)
  } catch (error) {
    throw new Error(`${fieldName} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}
