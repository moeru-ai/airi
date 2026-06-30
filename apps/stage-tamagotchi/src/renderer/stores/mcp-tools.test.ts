import type { Tool } from '@xsai/shared-chat'

import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/llm-tools'
import { useLlmToolsetPromptsStore } from '@proj-airi/stage-ui/stores/llm-toolset-prompts'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMocks = vi.hoisted(() => ({
  callMcpTool: vi.fn(async () => ({
    content: [{ type: 'text', text: 'ok' }],
    isError: false,
  })),
  listMcpTools: vi.fn(async () => [{
    serverName: 'filesystem',
    name: 'filesystem::search',
    toolName: 'search',
    description: 'Search files.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
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
  const { useTamagotchiMcpToolsStore } = await import('./mcp-tools')

  beforeEach(() => {
    setActivePinia(createPinia())
    invokeMocks.listMcpTools.mockClear()
    invokeMocks.callMcpTool.mockClear()
    globalThis.localStorage?.clear?.()
  })

  /**
   * @example
   * await store.refresh()
   * expect(promptsStore.activeToolsetPrompt).toContain('filesystem::search')
   */
  it('advertises cold tools in the catalog, proxies execution, promotes a used tool to native, and clears on dispose', async () => {
    const llmToolsStore = useLlmToolsStore()
    const promptsStore = useLlmToolsetPromptsStore()
    const store = useTamagotchiMcpToolsStore()
    store.activatedRefs = []
    const toolOptions = {} as Parameters<Tool['execute']>[1]

    await store.refresh()

    // Cold start: only the two meta-tools are registered; the cold tool lives in the awareness catalog.
    expect(llmToolsStore.toolsByProvider.mcp?.map(tool => tool.function.name)).toEqual([
      'builtIn_mcpListTools',
      'builtIn_mcpCallTool',
    ])
    expect(promptsStore.activeToolsetPrompt).toContain('filesystem::search')

    // Using the tool proxies through the bridge with parsed args...
    const callTool = llmToolsStore.toolsByProvider.mcp?.find(tool => tool.function.name === 'builtIn_mcpCallTool')
    const callResult = await callTool?.execute({
      name: 'filesystem::search',
      arguments: JSON.stringify({ query: 'hello', limit: 10 }),
    }, toolOptions)

    expect(invokeMocks.callMcpTool).toHaveBeenCalledWith({
      name: 'filesystem::search',
      arguments: { query: 'hello', limit: 10 },
    })
    expect(callResult).toEqual({ content: [{ type: 'text', text: 'ok' }], isError: false })

    // ...and activates it: from the next refresh it is a native first-class tool, gone from the catalog.
    expect(store.activatedRefs).toContain('filesystem::search')
    await store.refresh()
    expect(llmToolsStore.toolsByProvider.mcp?.map(tool => tool.function.name)).toContain('mcp__filesystem__search')
    expect(promptsStore.activeToolsetPrompt).not.toContain('filesystem::search')

    // Manual deactivation demotes it back to the catalog (native registration dropped).
    store.deactivate('filesystem::search')
    expect(store.activatedRefs).not.toContain('filesystem::search')
    await store.refresh()
    expect(llmToolsStore.toolsByProvider.mcp?.map(tool => tool.function.name)).not.toContain('mcp__filesystem__search')
    expect(promptsStore.activeToolsetPrompt).toContain('filesystem::search')

    store.dispose()
    expect(llmToolsStore.toolsByProvider.mcp).toBeUndefined()
    expect(promptsStore.activeToolsetPrompt).toBe('')
  })
})
