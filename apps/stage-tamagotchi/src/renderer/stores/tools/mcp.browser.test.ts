import type { Tool } from '@xsai/shared-chat'

import { PiniaColada } from '@pinia/colada'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import { createPinia, disposePinia } from 'pinia'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useTamagotchiMcpToolsStore } from './mcp'

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

vi.mock('@proj-airi/electron-vueuse', async () => {
  const { createContext } = await import('@moeru/eventa')
  const { shallowRef } = await import('vue')
  const context = createContext()
  return {
    useElectronEventaContext: () => shallowRef(context),
    useElectronEventaInvoke: (event: { receiveEvent?: { id?: string } }) => {
      if (event?.receiveEvent?.id === 'eventa:invoke:electron:mcp:list-tools-receive')
        return invokeMocks.listMcpTools
      if (event?.receiveEvent?.id === 'eventa:invoke:electron:mcp:call-tool-receive')
        return invokeMocks.callMcpTool
      if (event?.receiveEvent?.id?.startsWith('eventa:invoke:chat-request:'))
        return vi.fn(async () => ({}))

      throw new Error(`Unexpected eventa invoke: ${JSON.stringify(event)}`)
    },
  }
})

describe('useTamagotchiMcpToolsStore', () => {
  beforeEach(() => {
    invokeMocks.listMcpTools.mockClear()
    invokeMocks.callMcpTool.mockClear()
  })

  it('loads MCP tools, proxies execution, and clears them from the shared llm-tools store', async () => {
    const pinia = createPinia()
    let llmToolsStore!: ReturnType<typeof useLlmToolsStore>
    let store!: ReturnType<typeof useTamagotchiMcpToolsStore>
    const view = render(defineComponent({
      setup() {
        llmToolsStore = useLlmToolsStore()
        store = useTamagotchiMcpToolsStore()
        return () => h('div')
      },
    }), { global: { plugins: [pinia, PiniaColada, createI18n({ legacy: false, locale: 'en', messages: { en: {} } })] } })
    onTestFinished(() => {
      view.unmount()
      disposePinia(pinia)
    })
    const toolOptions = {} as Parameters<Tool['execute']>[1]

    await store.refresh()

    const mcpDefinitions = llmToolsStore.tools.filter(tool => tool.id.startsWith('mcp:'))
    const listTools = llmToolsStore.activeTools.find(tool => tool.function.name === 'builtIn_mcpListTools')
    const callTool = llmToolsStore.activeTools.find(tool => tool.function.name === 'builtIn_mcpCallTool')

    expect(mcpDefinitions).toEqual([
      expect.objectContaining({
        id: 'mcp:builtIn_mcpListTools',
        function: expect.objectContaining({ name: 'builtIn_mcpListTools' }),
      }),
      expect.objectContaining({
        id: 'mcp:builtIn_mcpCallTool',
        function: expect.objectContaining({ name: 'builtIn_mcpCallTool' }),
      }),
    ])
    expect(JSON.stringify(llmToolsStore.$state)).not.toContain('execute')
    expect(listTools?.function.description).toContain('"name":"filesystem"')
    expect(listTools?.function.description).not.toContain('filesystem::search')
    expect(invokeMocks.callMcpTool).not.toHaveBeenCalled()

    const listResult = await listTools?.execute({}, toolOptions)
    const callResult = await callTool?.execute({
      name: 'filesystem::search',
      arguments: JSON.stringify({ query: 'hello', limit: 10 }),
    }, toolOptions)

    expect(invokeMocks.listMcpTools).toHaveBeenCalledTimes(2)
    expect(invokeMocks.callMcpTool).toHaveBeenCalledWith({
      name: 'filesystem::search',
      arguments: { query: 'hello', limit: 10 },
      requestId: undefined,
      attribution: undefined,
    }, { signal: undefined })
    expect(listResult).toEqual([{
      serverName: 'filesystem',
      name: 'filesystem::search',
      toolName: 'search',
      description: 'Search files.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    }])
    expect(callResult).toEqual({
      content: [{ type: 'text', text: 'ok' }],
      isError: false,
    })

    store.dispose()

    expect(llmToolsStore.tools.filter(tool => tool.id.startsWith('mcp:'))).toEqual([])
  })
})
