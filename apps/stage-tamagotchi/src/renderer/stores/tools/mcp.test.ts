import type { Tool } from '@xsai/shared-chat'

import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMocks = vi.hoisted(() => ({
  callMcpTool: vi.fn(async () => ({
    content: [{ text: 'ok', type: 'text' }],
    isError: false,
  })),
  listMcpTools: vi.fn(async () => [{
    description: 'Search files.',
    inputSchema: {
      properties: {},
      type: 'object',
    },
    name: 'filesystem::search',
    serverName: 'filesystem',
    toolName: 'search',
  }]),
}))

vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaInvoke: (event: { receiveEvent?: { id?: string } }) => {
    if (event?.receiveEvent?.id === 'eventa:invoke:electron:mcp:list-tools-receive')
      return invokeMocks.listMcpTools
    if (event?.receiveEvent?.id === 'eventa:invoke:electron:mcp:call-tool-receive')
      return invokeMocks.callMcpTool

    throw new Error(`Unexpected eventa invoke: ${JSON.stringify(event)}`)
  },
}))

describe('useTamagotchiMcpToolsStore', async () => {
  const { useTamagotchiMcpToolsStore } = await import('./mcp')

  beforeEach(() => {
    setActivePinia(createPinia())
    invokeMocks.listMcpTools.mockClear()
    invokeMocks.callMcpTool.mockClear()
  })

  it('loads MCP tools, proxies execution, and clears them from the shared llm-tools store', async () => {
    const llmToolsStore = useLlmToolsStore()
    const store = useTamagotchiMcpToolsStore()
    const toolOptions = {} as Parameters<Tool['execute']>[1]

    await store.refresh()

    const mcpDefinitions = llmToolsStore.tools.filter(tool => tool.id.startsWith('mcp:'))
    const listTools = llmToolsStore.activeTools.find(tool => tool.function.name === 'builtIn_mcpListTools')
    const callTool = llmToolsStore.activeTools.find(tool => tool.function.name === 'builtIn_mcpCallTool')

    expect(mcpDefinitions).toEqual([
      expect.objectContaining({
        function: expect.objectContaining({ name: 'builtIn_mcpListTools' }),
        id: 'mcp:builtIn_mcpListTools',
      }),
      expect.objectContaining({
        function: expect.objectContaining({ name: 'builtIn_mcpCallTool' }),
        id: 'mcp:builtIn_mcpCallTool',
      }),
    ])
    expect(JSON.stringify(llmToolsStore.$state)).not.toContain('execute')

    const listResult = await listTools?.execute({}, toolOptions)
    const callResult = await callTool?.execute({
      arguments: JSON.stringify({ limit: 10, query: 'hello' }),
      name: 'filesystem::search',
    }, toolOptions)

    expect(invokeMocks.listMcpTools).toHaveBeenCalledTimes(1)
    expect(invokeMocks.callMcpTool).toHaveBeenCalledWith({
      arguments: { limit: 10, query: 'hello' },
      name: 'filesystem::search',
    })
    expect(listResult).toEqual([{
      description: 'Search files.',
      inputSchema: {
        properties: {},
        type: 'object',
      },
      name: 'filesystem::search',
      serverName: 'filesystem',
      toolName: 'search',
    }])
    expect(callResult).toEqual({
      content: [{ text: 'ok', type: 'text' }],
      isError: false,
    })

    store.dispose()

    expect(llmToolsStore.tools.filter(tool => tool.id.startsWith('mcp:'))).toEqual([])
  })
})
