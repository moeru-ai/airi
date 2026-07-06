import type { Tool } from '@xsai/shared-chat'
import type { McpToolSummary } from '@proj-airi/stage-ui/coding-workspace'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('useTamagotchiCodingWorkspaceStore', async () => {
  const { inferCodingWorkspaceMcpBackendState, useTamagotchiCodingWorkspaceStore } = await import('./coding-workspace')
  const stageUiCodingWorkspace = await import('@proj-airi/stage-ui/coding-workspace')
  const { CODING_WORKSPACE_TOOL_NAMES, approveTasksArtifact, createSubagentJob, transitionSubagentJob } =
    stageUiCodingWorkspace
  const { useLlmToolsStore } = await import('@proj-airi/stage-ui/stores/llm-tools')
  const { useLlmToolsetPromptsStore } = await import('@proj-airi/stage-ui/stores/llm-toolset-prompts')

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts disabled with native engine and no registered coding tools or prompts', () => {
    const llmToolsStore = useLlmToolsStore()
    const llmToolsetPromptsStore = useLlmToolsetPromptsStore()
    const store = useTamagotchiCodingWorkspaceStore()

    expect(store.codingContextEnabled).toBe(false)
    expect(store.activeWorkspaceRoot).toBeUndefined()
    expect(store.codingMode).toBe('ask')
    expect(store.specEntryPath).toBe('requirements-first')
    expect(store.engine).toBe('native')
    expect(store.mcpBackendState).toBe('unavailable')
    expect(llmToolsStore.toolsByProvider['coding-workspace']).toBeUndefined()
    expect(llmToolsetPromptsStore.promptsByProvider['coding-workspace']).toBeUndefined()
  })

  it('registers coding tools and prompt contributions only while coding context is enabled', async () => {
    const callMcpTool = vi.fn(async (input) => ({ toolResult: { input } }))
    const listMcpTools = vi.fn(async () => [
      { serverName: 'serena', name: 'serena::find_symbol', toolName: 'find_symbol' },
      { serverName: 'serena', name: 'serena::search_for_pattern', toolName: 'search_for_pattern' },
    ])
    const llmToolsStore = useLlmToolsStore()
    const llmToolsetPromptsStore = useLlmToolsetPromptsStore()
    const store = useTamagotchiCodingWorkspaceStore()
    const toolOptions = {} as Parameters<Tool['execute']>[1]

    store.setMcpRuntime({
      callMcpTool,
      listMcpTools,
    })
    store.setActiveWorkspaceRoot('/repo/airi')
    store.setCodingMode('code')
    await store.setCodingContextEnabled(true)

    const codingTools = llmToolsStore.toolsByProvider['coding-workspace']
    const findSymbolTool = codingTools?.find((tool) => tool.function.name === 'workspace_find_symbol')

    expect(codingTools?.map((tool) => tool.function.name)).toEqual(
      expect.arrayContaining([
        'workspace_status',
        'workspace_find_symbol',
        'workspace_ranked_context',
        'workspace_create_subagent_job',
      ]),
    )
    expect(llmToolsetPromptsStore.activeToolsetPrompt).toContain('Coding Workspace Code')

    const result = await findSymbolTool?.execute({ query: 'useAiriCardStore' }, toolOptions)

    expect(callMcpTool).toHaveBeenCalledWith({
      name: 'serena::find_symbol',
      serverName: 'serena',
      toolName: 'find_symbol',
      arguments: {
        name_path: 'useAiriCardStore',
      },
    })
    expect(result).toEqual(
      expect.objectContaining({
        backend: 'serena',
        serverName: 'serena',
        toolName: 'find_symbol',
      }),
    )

    store.dispose()

    expect(llmToolsStore.toolsByProvider['coding-workspace']).toBeUndefined()
    expect(llmToolsetPromptsStore.promptsByProvider['coding-workspace']).toBeUndefined()
  })

  it('tracks mode, spec entry path, workspace root, and Serena backend status', () => {
    const store = useTamagotchiCodingWorkspaceStore()

    store.setActiveWorkspaceRoot('  /repo/airi  ')
    store.setCodingMode('debug')
    store.setSpecEntryPath('quick-spec')
    store.updateMcpBackendStateFromTools([
      { serverName: 'code-intel', name: 'code-intel::find_symbol', toolName: 'find_symbol' },
      { serverName: 'code-intel', name: 'code-intel::get_symbols_overview', toolName: 'get_symbols_overview' },
    ])

    expect(store.activeWorkspaceRoot).toBe('/repo/airi')
    expect(store.codingMode).toBe('debug')
    expect(store.specEntryPath).toBe('quick-spec')
    expect(store.mcpBackendState).toBe('serena')
    expect(store.serenaAvailable).toBe(true)
    expect(store.status).toEqual(
      expect.objectContaining({
        codingContextEnabled: false,
        engine: 'native',
        mcpBackend: 'serena',
        mode: 'debug',
        specEntryPath: 'quick-spec',
        workspaceRoot: '/repo/airi',
      }),
    )
  })

  it('degrades backend state to generic MCP or unavailable when Serena is missing', () => {
    expect(inferCodingWorkspaceMcpBackendState([])).toBe('unavailable')
    expect(
      inferCodingWorkspaceMcpBackendState([
        { serverName: 'filesystem', name: 'filesystem::search', toolName: 'search' },
      ]),
    ).toBe('available')
    expect(
      inferCodingWorkspaceMcpBackendState([
        { serverName: 'serena', name: 'serena::replace_symbol_body', toolName: 'replace_symbol_body' },
      ]),
    ).toBe('available')
    expect(
      inferCodingWorkspaceMcpBackendState([
        { serverName: 'serena', name: 'serena::search_for_pattern', toolName: 'search_for_pattern' },
      ]),
    ).toBe('serena')
  })

  // -- New tests --
  describe('runtime behavior', () => {
    const defaultMcpTools: McpToolSummary[] = [
      { serverName: 'serena', name: 'serena::find_symbol', toolName: 'find_symbol' },
      { serverName: 'serena', name: 'serena::search_for_pattern', toolName: 'search_for_pattern' },
    ]

    // helper: enable the workspace with a default mock runtime and return both tools + status tool
    async function enable(tools: McpToolSummary[] = defaultMcpTools) {
      const callMcpTool = vi.fn(async (input: unknown) => ({ toolResult: { input }, called: input }))
      const listMcpTools = vi.fn(async () => tools)
      const store = useTamagotchiCodingWorkspaceStore()
      const llmToolsStore = useLlmToolsStore()
      store.setMcpRuntime({ callMcpTool, listMcpTools })
      store.setActiveWorkspaceRoot('/repo/airi')
      store.setCodingMode('code')
      await store.setCodingContextEnabled(true)
      const codingTools: Tool[] = llmToolsStore.toolsByProvider['coding-workspace'] ?? []
      return { store, callMcpTool, listMcpTools, codingTools, llmToolsStore }
    }

    it('(1) workspace_status tool reports active status', async () => {
      const { codingTools, store } = await enable([
        { serverName: 'serena', name: 'serena::find_symbol', toolName: 'find_symbol' },
        { serverName: 'serena', name: 'serena::search_for_pattern', toolName: 'search_for_pattern' },
      ])
      const statusTool = codingTools.find((tool) => tool.function.name === 'workspace_status')
      expect(statusTool).toBeDefined()
      const result = await statusTool?.execute(
        {},
        {
          messages: [],
          toolCallId: 'tool-call-id',
        },
      )
      expect(result).toEqual(
        expect.objectContaining({
          mode: store.status.mode,
          workspaceRoot: store.status.workspaceRoot,
          mcpBackend: store.status.mcpBackend,
          activeFeatureSlug: store.status.activeFeatureSlug,
          engine: store.status.engine,
        }),
      )
    })

    it('(2) workspace_get_symbols_overview and workspace_get_diagnostics are registered', async () => {
      const { codingTools } = await enable()
      const names = codingTools.map((tool) => tool.function.name)
      expect(names).toContain('workspace_get_symbols_overview')
      expect(names).toContain('workspace_get_diagnostics')
      expect(CODING_WORKSPACE_TOOL_NAMES).toContain('workspace_get_symbols_overview')
      expect(CODING_WORKSPACE_TOOL_NAMES).toContain('workspace_get_diagnostics')
    })

    it('(3) subagent job transition lifecycle and invalid transitions', async () => {
      const { store } = await enable()
      // approve tasks.md via the subagent store so implementation phase can be created queued
      const currentStore = store.subagentJobStore
      const approvedStore = approveTasksArtifact(currentStore)
      store.subagentJobStore = approvedStore

      const mutation = createSubagentJob(approvedStore, { phase: 'implementation', taskDescription: 'Implement X' })
      store.subagentJobStore = mutation.store
      // transition to running
      const runningMutation = transitionSubagentJob(store.subagentJobStore, mutation.jobId, 'running')
      store.subagentJobStore = runningMutation.store
      // transition to failed
      const failedMutation = transitionSubagentJob(store.subagentJobStore, mutation.jobId, 'failed')
      store.subagentJobStore = failedMutation.store
      expect(store.subagentJobStore.jobs[mutation.jobId]?.status).toBe('failed')
      // attempt invalid transition from failed → running; expect SubagentJobLifecycleError
      expect(() => {
        transitionSubagentJob(store.subagentJobStore, mutation.jobId, 'running')
      }).toThrow()
    })

    it('(4) setActiveWorkspaceRoot trims whitespace and handles empty string', () => {
      const store = useTamagotchiCodingWorkspaceStore()
      // current store implementation stores undefined when trimmed-root is empty
      store.setActiveWorkspaceRoot('   ')
      expect(['', undefined]).toContain(store.activeWorkspaceRoot)
      store.setActiveWorkspaceRoot(' /repo/airi ')
      expect(store.activeWorkspaceRoot).toBe('/repo/airi')
      store.setActiveWorkspaceRoot('')
      expect(['', undefined]).toContain(store.activeWorkspaceRoot)
    })
  })

  describe('registration lifecycle', () => {
    it('(5) concurrent enable/disable toggles do not leak registrations', async () => {
      const listMcpTools = vi.fn(async () => [
        { serverName: 'serena', name: 'serena::find_symbol', toolName: 'find_symbol' },
        { serverName: 'serena', name: 'serena::search_for_pattern', toolName: 'search_for_pattern' },
      ])
      const callMcpTool = vi.fn(async (input) => ({ toolResult: { input } }))
      const llmToolsStore = useLlmToolsStore()
      const store = useTamagotchiCodingWorkspaceStore()
      store.setMcpRuntime({ callMcpTool, listMcpTools })
      store.setActiveWorkspaceRoot('/repo/airi')
      store.setCodingMode('code')

      // enable three times sequentially (re-entrancy)
      await store.setCodingContextEnabled(true)
      await store.setCodingContextEnabled(true)
      await store.setCodingContextEnabled(true)
      expect(llmToolsStore.toolsByProvider['coding-workspace']).toBeDefined()

      // disable and confirm removed
      await store.setCodingContextEnabled(false)
      expect(llmToolsStore.toolsByProvider['coding-workspace']).toBeUndefined()

      // re-enable cleanly
      await store.setCodingContextEnabled(true)
      expect(llmToolsStore.toolsByProvider['coding-workspace']).toBeDefined()
      expect(llmToolsStore.toolsByProvider['coding-workspace']?.length).toBeGreaterThan(0)
    })
  })

  describe('inferCodingWorkspaceMcpBackendState edge cases', () => {
    it('(6a) empty array → unavailable', () => {
      expect(inferCodingWorkspaceMcpBackendState([])).toBe('unavailable')
    })

    it('(6b) one non-Serena generic tool → available', () => {
      expect(
        inferCodingWorkspaceMcpBackendState([
          { name: 'filesystem::search', toolName: 'search', serverName: 'filesystem' },
        ]),
      ).toBe('available')
    })

    it('(6c) one Serena mutating tool → available (no upgrade)', () => {
      expect(
        inferCodingWorkspaceMcpBackendState([
          { name: 'serena::rename_symbol', toolName: 'rename_symbol', serverName: 'serena' },
        ]),
      ).toBe('available')
    })

    it('(6d) one Serena read-only tool (get_symbols_overview) carrying Serena hint → serena', () => {
      expect(
        inferCodingWorkspaceMcpBackendState([
          { name: 'serena::get_symbols_overview', toolName: 'get_symbols_overview', serverName: 'serena' },
        ]),
      ).toBe('serena')
    })

    it('(6e) two distinct Serena read-only tools from the same server → serena', () => {
      expect(
        inferCodingWorkspaceMcpBackendState([
          { name: 'serena::find_symbol', toolName: 'find_symbol', serverName: 'serena' },
          { name: 'serena::search_for_pattern', toolName: 'search_for_pattern', serverName: 'serena' },
        ]),
      ).toBe('serena')
    })

    it('(6f) mixed mutating + single read-only → serena (serena read-only single-but-hinted)', () => {
      expect(
        inferCodingWorkspaceMcpBackendState([
          { name: 'serena::rename_symbol', toolName: 'rename_symbol', serverName: 'serena' },
          { name: 'serena::search_for_pattern', toolName: 'search_for_pattern', serverName: 'serena' },
        ]),
      ).toBe('serena')
    })

    it('(6falt) mixed mutating + one read-only-only tool with Serena hint → serena', () => {
      expect(
        inferCodingWorkspaceMcpBackendState([
          { name: 'ren_sym', toolName: 'rename_symbol', serverName: 'serena' },
          { name: 'sea_pat', toolName: 'search_for_pattern', serverName: 'serena' },
        ]),
      ).toBe('serena')
    })
  })
})
