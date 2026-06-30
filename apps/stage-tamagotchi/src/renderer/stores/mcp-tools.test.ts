import type { Tool } from '@xsai/shared-chat'

import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/llm-tools'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMocks = vi.hoisted(() => ({
  callMcpTool: vi.fn(() => ({
    content: [{ type: 'text', text: 'ok' }],
    isError: false,
  })),
  listMcpTools: vi.fn(() => [
    {
      serverName: 'filesystem',
      name: 'filesystem::search',
      toolName: 'search',
      description: 'Search files.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ]),
}))

vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaInvoke: (event: { receiveEvent?: { id?: string } }) => {
    if (event?.receiveEvent?.id === 'eventa:invoke:electron:mcp:list-tools-receive') return invokeMocks.listMcpTools
    if (event?.receiveEvent?.id === 'eventa:invoke:electron:mcp:call-tool-receive') return invokeMocks.callMcpTool

    throw new Error(`Unexpected eventa invoke: ${JSON.stringify(event)}`)
  },
}))

describe('useTamagotchiMcpToolsStore', async () => {
  const { useTamagotchiCodingWorkspaceStore } = await import('./coding-workspace')
  const { useTamagotchiMcpToolsStore } = await import('./mcp-tools')

  beforeEach(() => {
    setActivePinia(createPinia())
    invokeMocks.listMcpTools.mockClear()
    invokeMocks.callMcpTool.mockClear()
  })

  /**
   * @example
   * await store.refresh()
   * expect(llmToolsStore.toolsByProvider.mcp).toHaveLength(2)
   */
  it('loads MCP tools, proxies execution, and clears them from the shared llm-tools store', async () => {
    const llmToolsStore = useLlmToolsStore()
    const codingWorkspaceStore = useTamagotchiCodingWorkspaceStore()
    const store = useTamagotchiMcpToolsStore()
    const toolOptions = {} as Parameters<Tool['execute']>[1]

    await store.refresh()

    const mcpTools = llmToolsStore.toolsByProvider.mcp
    const listTools = mcpTools?.find((tool) => tool.function.name === 'builtIn_mcpListTools')
    const callTool = mcpTools?.find((tool) => tool.function.name === 'builtIn_mcpCallTool')

    expect(mcpTools).toEqual([
      expect.objectContaining({ function: expect.objectContaining({ name: 'builtIn_mcpListTools' }) }),
      expect.objectContaining({ function: expect.objectContaining({ name: 'builtIn_mcpCallTool' }) }),
    ])
    expect(codingWorkspaceStore.mcpBackendState).toBe('available')

    const listResult = await listTools?.execute({}, toolOptions)
    const callResult = await callTool?.execute(
      {
        name: 'filesystem::search',
        arguments: JSON.stringify({ query: 'hello', limit: 10 }),
      },
      toolOptions,
    )

    expect(invokeMocks.listMcpTools).toHaveBeenCalledTimes(2)
    expect(invokeMocks.callMcpTool).toHaveBeenCalledWith({
      name: 'filesystem::search',
      arguments: { query: 'hello', limit: 10 },
    })
    expect(listResult).toEqual([
      {
        serverName: 'filesystem',
        name: 'filesystem::search',
        toolName: 'search',
        description: 'Search files.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ])
    expect(callResult).toEqual({
      content: [{ type: 'text', text: 'ok' }],
      isError: false,
    })

    store.dispose()

    expect(llmToolsStore.toolsByProvider.mcp).toBeUndefined()
  })

  it('updates coding workspace backend state to Serena after MCP refresh finds read-only Serena tools', async () => {
    invokeMocks.listMcpTools.mockReturnValueOnce([
      {
        serverName: 'serena',
        name: 'serena::find_symbol',
        toolName: 'find_symbol',
        description: 'Find a symbol.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        serverName: 'serena',
        name: 'serena::search_for_pattern',
        toolName: 'search_for_pattern',
        description: 'Search source text.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ])

    const codingWorkspaceStore = useTamagotchiCodingWorkspaceStore()
    const store = useTamagotchiMcpToolsStore()

    await store.refresh()

    expect(codingWorkspaceStore.mcpBackendState).toBe('serena')
    expect(codingWorkspaceStore.serenaAvailable).toBe(true)
  })

  it('updates coding workspace backend state to unavailable after MCP refresh finds no tools', async () => {
    invokeMocks.listMcpTools.mockReturnValueOnce([])

    const codingWorkspaceStore = useTamagotchiCodingWorkspaceStore()
    const store = useTamagotchiMcpToolsStore()

    await store.refresh()

    expect(codingWorkspaceStore.mcpBackendState).toBe('unavailable')
    expect(codingWorkspaceStore.serenaAvailable).toBe(false)
  })
})
