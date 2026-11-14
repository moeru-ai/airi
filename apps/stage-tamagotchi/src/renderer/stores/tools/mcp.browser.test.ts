import type { Tool } from '@xsai/shared-chat'

import type { ElectronMcpConfigText, ElectronMcpToolDescriptor } from '../../../shared/eventa'

import { PiniaColada } from '@pinia/colada'
import { setupSynced, usePiniaSynced } from '@proj-airi/stage-ui/libs/pinia/setup-synced'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { createPinia, disposePinia } from 'pinia'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import McpSettings from '../../pages/settings/modules/mcp.vue'

import { useTamagotchiMcpToolsStore } from './mcp'

const invokeMocks = vi.hoisted(() => ({
  callMcpTool: vi.fn(async () => ({
    content: [{ type: 'text', text: 'ok' }],
    isError: false,
  })),
  applyAndRestart: vi.fn(),
  readConfig: vi.fn<() => Promise<Pick<ElectronMcpConfigText, 'text'>>>(),
  writeConfig: vi.fn<(config: Pick<ElectronMcpConfigText, 'text'>) => Promise<Pick<ElectronMcpConfigText, 'text'>>>(),
  registerRequest: vi.fn(async () => ({})),
  getRuntimeStatus: vi.fn(async () => ({ servers: [{ name: 'filesystem', state: 'running' }] })),
  listMcpTools: vi.fn(async (_payload?: { name: string }): Promise<ElectronMcpToolDescriptor[]> => [{
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

const directTerminal: ElectronMcpToolDescriptor = {
  serverName: 'airi-terminal',
  name: 'airi-terminal::terminal_exec',
  toolName: 'terminal_exec',
  exposure: 'direct',
  inputSchema: { type: 'object', properties: {} },
}

function rendererPlugins(pinia: ReturnType<typeof createPinia>) {
  return [pinia, PiniaColada, createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false })]
}

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
      if (event?.receiveEvent?.id === 'eventa:invoke:electron:mcp:get-runtime-status-receive')
        return invokeMocks.getRuntimeStatus
      if (event?.receiveEvent?.id === 'eventa:invoke:electron:mcp:apply-and-restart-receive')
        return invokeMocks.applyAndRestart
      if (event?.receiveEvent?.id === 'eventa:invoke:electron:mcp:read-config-text-receive')
        return invokeMocks.readConfig
      if (event?.receiveEvent?.id === 'eventa:invoke:electron:mcp:write-config-text-receive')
        return invokeMocks.writeConfig
      if (event?.receiveEvent?.id === 'eventa:invoke:chat-request:register-receive')
        return invokeMocks.registerRequest
      if (event?.receiveEvent?.id === 'eventa:invoke:electron:mcp:open-config-file-receive' || event?.receiveEvent?.id === 'eventa:invoke:electron:mcp:test-server-receive')
        return vi.fn()
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
    invokeMocks.registerRequest.mockReset().mockResolvedValue({})
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
    }), { global: { plugins: rendererPlugins(pinia) } })
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
    expect(listTools?.function.description).toContain('Servers at registration: ["filesystem"]')
    expect(listTools?.function.description).not.toContain('filesystem::search')
    expect(invokeMocks.callMcpTool).not.toHaveBeenCalled()

    const listResult = await listTools?.execute({}, toolOptions)
    const callResult = await callTool?.execute({
      name: 'filesystem::search',
      arguments: JSON.stringify({ query: 'hello', limit: 10 }),
    }, toolOptions)

    expect(invokeMocks.listMcpTools).toHaveBeenCalledTimes(2)
    expect(invokeMocks.listMcpTools).toHaveBeenNthCalledWith(1, { name: 'airi-terminal::terminal_exec' })
    expect(invokeMocks.listMcpTools).toHaveBeenNthCalledWith(2, undefined)
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

  // https://github.com/moeru-ai/airi/pull/3496
  // ROOT CAUSE:
  // A rejected Terminal registration stopped the Chat hook chain before generation.
  // The hook now handles the rejection and leaves Terminal without a request ID.
  it('keeps normal Chat running when Terminal request registration fails', async () => {
    const pinia = createPinia()
    const view = render(defineComponent({ setup() {
      useTamagotchiMcpToolsStore()
      return () => h('div')
    } }), { global: { plugins: rendererPlugins(pinia) } })
    onTestFinished(() => {
      view.unmount()
      disposePinia(pinia)
    })
    const chat = useChatStore(pinia)
    await useTamagotchiMcpToolsStore(pinia).refresh()
    const nextHook = vi.fn(async () => {})
    chat.onBeforeSend(nextHook)
    const text = 'Read the fixture.'
    const context = { sessionId: 'session-a', turnId: 'turn-a', message: { role: 'user' as const, content: text }, contexts: {}, composedMessage: [] }
    invokeMocks.registerRequest.mockRejectedValueOnce(new Error('Host registration unavailable.'))

    await chat.emitBeforeSendHooks(text, context)

    expect(invokeMocks.registerRequest).toHaveBeenCalledWith({ sessionId: 'session-a', turnId: 'turn-a', text })
    expect(nextHook).toHaveBeenCalledOnce()

    const list = useLlmToolsStore(pinia).activeTools.find(tool => tool.function.name === 'builtIn_mcpListTools')!
    await expect(list.execute({}, {} as Parameters<Tool['execute']>[1])).resolves.toEqual([expect.objectContaining({ name: 'filesystem::search' })])
  })

  // https://github.com/moeru-ai/airi/pull/3496
  // ROOT CAUSE:
  // The settings page restarted the servers without updating the leader's tool definitions.
  // The page now calls the existing leader action after restart.
  it('refreshes the Chat leader tools after Terminal changes in the settings window', async () => {
    const leader = setupSynced({ leadership: 'leader-only' })
    const follower = setupSynced({ leadership: 'follower-only' })
    const leaderPinia = createPinia().use(leader.pinia)
    const followerPinia = createPinia().use(follower.pinia)
    let leaderRuntime!: ReturnType<typeof usePiniaSynced>
    const leaderView = render(defineComponent({ setup() {
      leaderRuntime = usePiniaSynced()
      useTamagotchiMcpToolsStore()
      return () => h('div')
    } }), { global: { plugins: [...rendererPlugins(leaderPinia), leader.vue] } })
    onTestFinished(() => {
      leaderView.unmount()
      disposePinia(leaderPinia)
    })
    let saved = false
    let running = false
    invokeMocks.readConfig.mockImplementation(async () => ({ text: JSON.stringify({ terminalEnabled: saved, mcpServers: {} }) }))
    invokeMocks.writeConfig.mockImplementation(async ({ text }: { text: string }) => {
      saved = JSON.parse(text).terminalEnabled === true
      return { text }
    })
    invokeMocks.applyAndRestart.mockImplementation(async () => {
      running = saved
      return { started: running ? [{ name: 'airi-terminal' }] : [], skipped: [], failed: [] }
    })
    invokeMocks.getRuntimeStatus.mockImplementation(async () => ({ servers: running ? [{ name: 'airi-terminal', state: 'running' }] : [] }))
    const originalList = invokeMocks.listMcpTools.getMockImplementation()!
    invokeMocks.listMcpTools.mockImplementation(async payload => running && payload?.name === directTerminal.name ? [directTerminal] : [])
    onTestFinished(() => {
      invokeMocks.listMcpTools.mockImplementation(originalList)
      invokeMocks.getRuntimeStatus.mockResolvedValue({ servers: [{ name: 'filesystem', state: 'running' }] })
    })
    await vi.waitFor(() => expect(leaderRuntime.isLeader()).toBe(true))
    await useTamagotchiMcpToolsStore(leaderPinia).refresh()
    const leaderTools = useLlmToolsStore(leaderPinia)
    const terminalIsVisible = () => leaderTools.activeTools.some(tool => tool.function.name === 'terminal_exec')
    expect(terminalIsVisible()).toBe(false)

    let followerRuntime!: ReturnType<typeof usePiniaSynced>
    const settings = render(defineComponent({ setup() {
      followerRuntime = usePiniaSynced()
      return () => h(McpSettings)
    } }), { global: { plugins: [...rendererPlugins(followerPinia), follower.vue], directives: { 'track-button': {} } } })
    onTestFinished(() => {
      settings.unmount()
      disposePinia(followerPinia)
    })
    await vi.waitFor(() => expect(followerRuntime.getLeaderId()).toBe(leaderRuntime.participantId))
    await expect.element(settings.getByTestId('terminal-connection-status')).toHaveTextContent('status.unknown')
    const terminalSwitch = settings.getByRole('switch')
    const apply = settings.getByRole('button', { name: 'settings.pages.modules.mcp-server.actions.apply-and-restart' })
    await terminalSwitch.click()
    await apply.click()
    await expect.element(settings.getByTestId('terminal-connection-status')).toHaveTextContent('status.running')
    await expect.poll(terminalIsVisible).toBe(true)

    await terminalSwitch.click()
    await apply.click()
    await expect.element(settings.getByTestId('terminal-connection-status')).toHaveTextContent('status.unknown')
    await expect.poll(terminalIsVisible).toBe(false)
    expect(invokeMocks.callMcpTool).not.toHaveBeenCalled()
  })

  // https://github.com/moeru-ai/airi/pull/3496
  // ROOT CAUSE:
  // A slow discovery response could replace the tools from a newer restart.
  // Only the latest refresh can now publish tool definitions.
  it('ignores a discovery response that predates the latest refresh', async () => {
    const pinia = createPinia()
    const view = render(defineComponent({ setup() {
      useTamagotchiMcpToolsStore()
      return () => h('div')
    } }), { global: { plugins: rendererPlugins(pinia) } })
    onTestFinished(() => {
      view.unmount()
      disposePinia(pinia)
    })
    const stale = Promise.withResolvers<ElectronMcpToolDescriptor[]>()
    invokeMocks.listMcpTools.mockReturnValueOnce(stale.promise).mockResolvedValueOnce([])
    const store = useTamagotchiMcpToolsStore(pinia)
    const earlier = store.refresh()
    await store.refresh()
    stale.resolve([directTerminal])
    await earlier

    expect(useLlmToolsStore(pinia).activeTools.map(tool => tool.function.name)).not.toContain('terminal_exec')
  })
})
