import type { Tool } from '@xsai/shared-chat'

import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/llm-tools'
import { useLlmToolsetPromptsStore } from '@proj-airi/stage-ui/stores/llm-toolset-prompts'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('useTamagotchiCodingWorkspaceStore', async () => {
  const { inferCodingWorkspaceMcpBackendState, useTamagotchiCodingWorkspaceStore } = await import('./coding-workspace')

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
})
