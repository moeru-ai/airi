import { describe, expect, it, vi } from 'vitest'

import { createCodeIntelligenceFacade, type CodeIntelligenceTransport } from '../code-intelligence'
import { createSpecModeState } from '../spec-mode'
import { approveTasksArtifact, createSubagentJobStore } from '../subagents'
import {
  CODING_WORKSPACE_PROMPT_CONTRIBUTION_IDS,
  CODING_WORKSPACE_TOOL_NAMES,
  createCodingWorkspaceTools,
  createCodingWorkspaceToolsetPrompts,
  type CodingWorkspaceStatus,
} from './index'

const serenaTransport: CodeIntelligenceTransport = {
  async listMcpTools() {
    return [
      { serverName: 'serena', name: 'serena::find_symbol', toolName: 'find_symbol' },
      { serverName: 'serena', name: 'serena::search_for_pattern', toolName: 'search_for_pattern' },
    ]
  },
  async callMcpTool(input) {
    return { structuredContent: { called: input } }
  },
}

describe('coding workspace tools', () => {
  it('exposes the expected xsai tool schema names', async () => {
    const tools = await createCodingWorkspaceTools(createRuntime())

    expect(CODING_WORKSPACE_TOOL_NAMES).toEqual([
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
    ])
    expect(tools.map((tool) => tool.function.name)).toEqual(CODING_WORKSPACE_TOOL_NAMES)
    expect(tools.every((tool) => tool.function.parameters.type === 'object')).toBe(true)
  })

  it('gates mutating tools by active coding mode', async () => {
    const runtime = createRuntime({ mode: 'ask' })
    const tools = await createCodingWorkspaceTools(runtime)
    const updateSpecArtifact = tools.find((tool) => tool.function.name === 'workspace_update_spec_artifact')
    const createSubagentJob = tools.find((tool) => tool.function.name === 'workspace_create_subagent_job')

    await expect(
      updateSpecArtifact?.execute(
        {
          artifactName: 'requirements.md',
          content: 'Draft requirements',
        },
        toolExecutionContext,
      ),
    ).resolves.toMatchObject({
      ok: false,
      reason: 'mode-not-allowed',
    })
    await expect(
      createSubagentJob?.execute(
        {
          phase: 'requirements',
          taskDescription: 'Research API shape',
        },
        toolExecutionContext,
      ),
    ).resolves.toMatchObject({
      ok: false,
      reason: 'mode-not-allowed',
    })
  })

  it('routes code intelligence calls through the injected facade', async () => {
    const workspace_find_symbol = vi.fn(async () => ({
      backend: 'serena' as const,
      serverName: 'serena',
      toolName: 'find_symbol',
      query: { query: 'AiriRuntime' },
      rawResult: { structuredContent: { symbols: ['AiriRuntime'] } },
    }))
    const tools = await createCodingWorkspaceTools(
      createRuntime({
        codeIntelligence: {
          ...createCodeIntelligenceFacade(serenaTransport),
          workspace_find_symbol,
        },
      }),
    )
    const findSymbol = tools.find((tool) => tool.function.name === 'workspace_find_symbol')

    await expect(findSymbol?.execute({ query: 'AiriRuntime' }, toolExecutionContext)).resolves.toMatchObject({
      backend: 'serena',
      serverName: 'serena',
      toolName: 'find_symbol',
    })
    expect(workspace_find_symbol).toHaveBeenCalledWith({ query: 'AiriRuntime' })
  })

  it('blocks source edits for Spec artifact updates', async () => {
    const tools = await createCodingWorkspaceTools(createRuntime({ mode: 'spec' }))
    const updateSpecArtifact = tools.find((tool) => tool.function.name === 'workspace_update_spec_artifact')

    await expect(
      updateSpecArtifact?.execute(
        {
          artifactName: 'requirements.md',
          path: 'packages/stage-ui/src/index.ts',
          content: 'source edit',
        },
        toolExecutionContext,
      ),
    ).resolves.toMatchObject({
      ok: false,
      reason: 'source-file-write-blocked',
    })
  })

  it('passes Serena provenance through subagent job updates', async () => {
    const store = approveTasksArtifact(createSubagentJobStore())
    const runtime = createRuntime({ mode: 'code', subagentStore: store })
    const tools = await createCodingWorkspaceTools(runtime)
    const createJob = tools.find((tool) => tool.function.name === 'workspace_create_subagent_job')
    const updateJob = tools.find((tool) => tool.function.name === 'workspace_update_subagent_job')
    const created = await createJob?.execute(
      {
        phase: 'implementation',
        taskDescription: 'Implement task 1',
        provenanceJson: JSON.stringify([
          {
            source: 'serena',
            backend: 'serena',
            serverName: 'serena',
            toolName: 'find_symbol',
            metadata: { query: { query: 'TaskRunner' } },
          },
        ]),
      },
      toolExecutionContext,
    )

    expect(created).toMatchObject({
      ok: true,
      jobId: 'job-1',
      job: {
        provenance: [
          {
            source: 'serena',
            backend: 'serena',
            serverName: 'serena',
            toolName: 'find_symbol',
          },
        ],
      },
    })

    await expect(
      updateJob?.execute(
        {
          jobId: 'job-1',
          status: 'running',
        },
        toolExecutionContext,
      ),
    ).resolves.toMatchObject({
      ok: true,
      job: {
        status: 'running',
      },
    })

    await expect(
      updateJob?.execute(
        {
          jobId: 'job-1',
          status: 'completed',
          outputJson: JSON.stringify({ kind: 'summary', value: 'Done' }),
          provenanceJson: JSON.stringify({
            source: 'serena',
            backend: 'serena',
            serverName: 'serena',
            toolName: 'search_for_pattern',
            metadata: { query: { query: 'workspace' } },
          }),
        },
        toolExecutionContext,
      ),
    ).resolves.toMatchObject({
      ok: true,
      job: {
        status: 'completed',
        provenance: expect.arrayContaining([
          expect.objectContaining({
            source: 'serena',
            backend: 'serena',
            serverName: 'serena',
            toolName: 'search_for_pattern',
          }),
        ]),
      },
    })
  })

  it('includes mode prompt contribution text', () => {
    const prompts = createCodingWorkspaceToolsetPrompts()

    expect(prompts.map((prompt) => prompt.id)).toEqual(CODING_WORKSPACE_PROMPT_CONTRIBUTION_IDS)
    expect(prompts.find((prompt) => prompt.id === 'coding-workspace.ask')?.content).toContain('Ask mode')
    expect(prompts.find((prompt) => prompt.id === 'coding-workspace.spec')?.content).toContain(
      'source edits are blocked',
    )
    expect(prompts.find((prompt) => prompt.id === 'coding-workspace.code')?.content).toContain('Code mode')
    expect(prompts.find((prompt) => prompt.id === 'coding-workspace.debug')?.content).toContain('Debug mode')
  })
})

const toolExecutionContext = {
  messages: [],
  toolCallId: 'tool-call-id',
}

function createRuntime(
  options: {
    mode?: 'ask' | 'spec' | 'code' | 'debug'
    codeIntelligence?: ReturnType<typeof createCodeIntelligenceFacade>
    subagentStore?: ReturnType<typeof createSubagentJobStore>
  } = {},
) {
  let subagentStore = options.subagentStore ?? createSubagentJobStore()

  return {
    codeIntelligence: options.codeIntelligence ?? createCodeIntelligenceFacade(serenaTransport),
    getMode: () => options.mode ?? 'code',
    getSpecModeState: () =>
      createSpecModeState({
        featureSlug: 'coding-workspace',
        entryPath: 'requirements-first',
      }),
    getStatus: (): CodingWorkspaceStatus => ({
      mode: options.mode ?? 'code',
      workspaceRoot: '/repo',
      mcpBackend: 'serena',
      activeFeatureSlug: 'coding-workspace',
    }),
    getSubagentStore: () => subagentStore,
    setSubagentStore: (nextStore: typeof subagentStore) => {
      subagentStore = nextStore
    },
    updateSpecArtifact: vi.fn(async (input) => ({
      artifactName: input.artifactName,
      path: input.path,
      content: input.content,
    })),
  }
}
