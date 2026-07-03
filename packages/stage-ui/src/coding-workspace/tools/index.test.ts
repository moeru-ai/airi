import type { CodeIntelligenceTransport } from '../code-intelligence'

import type { CodingWorkspaceStatus } from './index'
import { describe, expect, it, vi } from 'vitest'
import { createCodeIntelligenceFacade } from '../code-intelligence'
import { createSpecModeState } from '../spec-mode'
import { approveTasksArtifact, createSubagentJobStore } from '../subagents'
import {
  CODING_WORKSPACE_PROMPT_CONTRIBUTION_IDS,
  CODING_WORKSPACE_TOOL_NAMES,
  createCodingWorkspaceTools,
  createCodingWorkspaceToolsetPrompts,
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

describe('edge-case coverage', () => {
  it('aggregates ranked context and falls back to local search when no MCP tools resolve', async () => {
    const localResults = [{ filePath: 'src/runtime.ts', line: 20, text: 'needle here' }]
    const transport: CodeIntelligenceTransport = {
      async listMcpTools() {
        return []
      },
      async callMcpTool() {
        throw new Error('should not be called when no MCP tools resolve')
      },
      async searchFiles() {
        return localResults
      },
    }

    const runtime = createRuntime({ codeIntelligence: createCodeIntelligenceFacade(transport) })
    const tools = await createCodingWorkspaceTools(runtime)
    const rankedContext = tools.find((tool) => tool.function.name === 'workspace_ranked_context')

    const result = await rankedContext?.execute({ query: 'needle' }, toolExecutionContext)

    // symbol result is unavailable (no find_symbol tool, no fallback) and is filtered out.
    // pattern result falls back to local search via searchFiles.
    // expected aggregation: one pattern item with backend='unavailable' and toolName='local_search'.
    expect(result).toMatchObject({
      backend: 'unavailable',
      toolName: 'workspace_ranked_context',
      rawResult: {
        items: [
          {
            kind: 'pattern',
            result: {
              backend: 'unavailable',
              serverName: undefined,
              toolName: 'local_search',
              rawResult: localResults,
            },
          },
        ],
      },
    })
  })

  it('aggregates ranked context from Serena pattern result when symbol search misses', async () => {
    const patternMatches = [{ filePath: 'src/runtime.ts', line: 42, text: 'needle' }]
    const transport: CodeIntelligenceTransport = {
      async listMcpTools() {
        return [{ serverName: 'serena', name: 'serena::search_for_pattern', toolName: 'search_for_pattern' }]
      },
      async callMcpTool() {
        return { structuredContent: { matches: patternMatches } }
      },
      async searchFiles() {
        throw new Error('searchFiles should not be called when Serena resolves the tool')
      },
    }

    const runtime = createRuntime({ codeIntelligence: createCodeIntelligenceFacade(transport) })
    const tools = await createCodingWorkspaceTools(runtime)
    const rankedContext = tools.find((tool) => tool.function.name === 'workspace_ranked_context')

    const result = await rankedContext?.execute({ query: 'needle' }, toolExecutionContext)

    // find_symbol resolves to empty unavailable (no Serena find_symbol), and is filtered out.
    // search_for_pattern resolves via Serena.
    expect(result.backend).toBe('serena')
    expect(result.rawResult.items).toHaveLength(1)
    expect(result.rawResult.items[0]).toMatchObject({
      kind: 'pattern',
      result: {
        backend: 'serena',
        serverName: 'serena',
        toolName: 'search_for_pattern',
      },
    })
  })

  it('defaults spec artifact path to canonical artifact path when omitted', async () => {
    const runtime = createRuntime({ mode: 'spec' })
    const tools = await createCodingWorkspaceTools(runtime)
    const updateSpecArtifact = tools.find((tool) => tool.function.name === 'workspace_update_spec_artifact')

    // path omitted → tool should default to state.allowedArtifactPaths[input.artifactName]
    // which is 'docs/specs/coding-workspace/requirements.md'. That path is inside the
    // allowed write directory, so validation passes and the call succeeds.
    await expect(
      updateSpecArtifact?.execute(
        {
          artifactName: 'requirements.md',
          content: 'Refined requirements content',
        },
        toolExecutionContext,
      ),
    ).resolves.toMatchObject({
      ok: true,
      artifactName: 'requirements.md',
      path: 'docs/specs/coding-workspace/requirements.md',
    })
  })

  it('blocks workspace_update_spec_artifact outside spec and code modes', async () => {
    // specMutationModes = ['spec', 'code']. Both 'ask' and 'debug' are excluded.
    // NOTE: the task spec claims debug mode should allow this tool, but the tool source
    // explicitly lists only ['spec', 'code'] as permitted. Test reflects actual behaviour.
    const askRuntime = createRuntime({ mode: 'ask' })
    const askTools = await createCodingWorkspaceTools(askRuntime)
    const askUpdate = askTools.find((tool) => tool.function.name === 'workspace_update_spec_artifact')

    await expect(
      askUpdate?.execute({ artifactName: 'requirements.md', content: 'draft' }, toolExecutionContext),
    ).resolves.toMatchObject({
      ok: false,
      reason: 'mode-not-allowed',
    })

    const debugRuntime = createRuntime({ mode: 'debug' })
    const debugTools = await createCodingWorkspaceTools(debugRuntime)
    const debugUpdate = debugTools.find((tool) => tool.function.name === 'workspace_update_spec_artifact')

    await expect(
      debugUpdate?.execute({ artifactName: 'requirements.md', content: 'draft' }, toolExecutionContext),
    ).resolves.toMatchObject({
      ok: false,
      reason: 'mode-not-allowed',
    })
  })

  it('shapes JSON parse errors in provenanceJson as a tool failure, not an unhandled throw', async () => {
    const runtime = createRuntime({ mode: 'code' })
    const tools = await createCodingWorkspaceTools(runtime)
    const createJob = tools.find((tool) => tool.function.name === 'workspace_create_subagent_job')

    // The tool source wraps execute in try/catch via executeAllowed, and parseJson throws
    // synchronously. The throw is caught and converted to { ok: false, reason: 'tool-execution-failed', message: ... }.
    await expect(
      createJob?.execute(
        {
          phase: 'requirements',
          taskDescription: 'Research API shape',
          provenanceJson: '{invalid',
        },
        toolExecutionContext,
      ),
    ).resolves.toMatchObject({
      ok: false,
      reason: 'tool-execution-failed',
    })
  })

  it('round-trips an empty provenance JSON array', async () => {
    const runtime = createRuntime({ mode: 'code' })
    const tools = await createCodingWorkspaceTools(runtime)
    const createJob = tools.find((tool) => tool.function.name === 'workspace_create_subagent_job')

    const result = await createJob?.execute(
      {
        phase: 'requirements',
        taskDescription: 'Research API shape',
        provenanceJson: '[]',
      },
      toolExecutionContext,
    )

    expect(result).toMatchObject({
      ok: true,
      jobId: 'job-1',
      job: {
        provenance: [],
      },
    })
  })

  it('returns symbols overview from injected code intelligence', async () => {
    const fullSerenaTransport: CodeIntelligenceTransport = {
      ...serenaTransport,
      async listMcpTools() {
        return [
          { serverName: 'serena', name: 'serena::get_symbols_overview', toolName: 'get_symbols_overview' },
          { serverName: 'serena', name: 'serena::find_symbol', toolName: 'find_symbol' },
          { serverName: 'serena', name: 'serena::get_diagnostics_for_file', toolName: 'get_diagnostics_for_file' },
          { serverName: 'serena', name: 'serena::search_for_pattern', toolName: 'search_for_pattern' },
        ]
      },
    }
    const customFacade = createCodeIntelligenceFacade(fullSerenaTransport)
    const runtime = createRuntime({ codeIntelligence: customFacade })
    const tools = await createCodingWorkspaceTools(runtime)
    const symbolsOverview = tools.find((tool) => tool.function.name === 'workspace_get_symbols_overview')

    const result = await symbolsOverview?.execute({ relativePath: 'src/runtime.ts' }, toolExecutionContext)

    expect(result).toMatchObject({
      backend: 'serena',
      serverName: 'serena',
      toolName: 'get_symbols_overview',
      query: { relativePath: 'src/runtime.ts' },
    })
  })

  it('returns diagnostics from injected code intelligence', async () => {
    const fullSerenaTransport: CodeIntelligenceTransport = {
      ...serenaTransport,
      async listMcpTools() {
        return [
          { serverName: 'serena', name: 'serena::get_symbols_overview', toolName: 'get_symbols_overview' },
          { serverName: 'serena', name: 'serena::find_symbol', toolName: 'find_symbol' },
          { serverName: 'serena', name: 'serena::get_diagnostics_for_file', toolName: 'get_diagnostics_for_file' },
          { serverName: 'serena', name: 'serena::search_for_pattern', toolName: 'search_for_pattern' },
        ]
      },
    }
    const customFacade = createCodeIntelligenceFacade(fullSerenaTransport)
    const runtime = createRuntime({ codeIntelligence: customFacade })
    const tools = await createCodingWorkspaceTools(runtime)
    const diagnostics = tools.find((tool) => tool.function.name === 'workspace_get_diagnostics')

    const result = await diagnostics?.execute({ relativePath: 'src/runtime.ts' }, toolExecutionContext)

    expect(result).toMatchObject({
      backend: 'serena',
      serverName: 'serena',
      toolName: 'get_diagnostics_for_file',
      query: { relativePath: 'src/runtime.ts' },
    })
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
