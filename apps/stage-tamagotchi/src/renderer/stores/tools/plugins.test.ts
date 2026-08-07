import type { Tool } from '@xsai/shared-chat'

import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/llm-tools'
import { useLlmToolsetPromptsStore } from '@proj-airi/stage-ui/stores/llm-toolset-prompts'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMocks = vi.hoisted(() => ({
  invokePluginTool: vi.fn(async (payload: unknown) => payload),
  listPluginXsaiTools: vi.fn(async () => ({
    tools: [
      {
        ownerExtensionId: 'plugin-chess',
        name: 'play_chess',
        description: 'Play a chess move.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    ],
    prompts: [
      {
        ownerExtensionId: 'plugin-chess',
        id: 'chess-tools',
        prompt: {
          id: 'airi-plugin-game-chess.prompt',
          title: 'Chess Plugin Guidance',
          content: 'Do not pass fen or pgn when mode is "new".',
        },
      },
    ],
  })),
}))

vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaInvoke: (event: { receiveEvent?: { id?: string } }) => {
    if (event?.receiveEvent?.id === 'eventa:invoke:electron:plugins:tools:list-xsai-receive')
      return invokeMocks.listPluginXsaiTools
    if (event?.receiveEvent?.id === 'eventa:invoke:electron:plugins:tools:invoke-receive')
      return invokeMocks.invokePluginTool

    throw new Error(`Unexpected eventa invoke: ${JSON.stringify(event)}`)
  },
}))

describe('useTamagotchiPluginToolsStore', async () => {
  const { useTamagotchiPluginToolsStore } = await import('./plugins')

  beforeEach(() => {
    setActivePinia(createPinia())
    invokeMocks.listPluginXsaiTools.mockClear()
    invokeMocks.invokePluginTool.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('loads plugin xsai tools, proxies execution, and clears them from the shared llm-tools store', async () => {
    const llmToolsStore = useLlmToolsStore()
    const llmToolsetPromptsStore = useLlmToolsetPromptsStore()
    const store = useTamagotchiPluginToolsStore()
    const toolOptions = {} as Parameters<Tool['execute']>[1]

    await store.refresh()

    const pluginDefinitions = llmToolsStore.tools.filter(tool => tool.id.startsWith('plugin:'))
    const playChessTool = llmToolsStore.activeTools.find(tool => tool.function.name === 'play_chess')

    expect(pluginDefinitions).toEqual([
      expect.objectContaining({
        id: 'plugin:plugin-chess:play_chess',
        function: expect.objectContaining({ name: 'play_chess' }),
      }),
    ])
    expect(JSON.stringify(llmToolsStore.$state)).not.toContain('execute')
    expect(llmToolsetPromptsStore.activeToolsetPrompt).toContain('Do not pass fen or pgn when mode is "new".')

    const executionResult = await playChessTool?.execute({
      move: 'e2e4',
    }, toolOptions)

    expect(invokeMocks.invokePluginTool).toHaveBeenCalledWith({
      ownerExtensionId: 'plugin-chess',
      name: 'play_chess',
      input: {
        move: 'e2e4',
      },
    })
    expect(executionResult).toEqual({
      ownerExtensionId: 'plugin-chess',
      name: 'play_chess',
      input: {
        move: 'e2e4',
      },
    })

    store.dispose()

    expect(llmToolsStore.tools.filter(tool => tool.id.startsWith('plugin:'))).toEqual([])
    expect(llmToolsetPromptsStore.promptsByProvider['plugin-tools']).toBeUndefined()
  })

  it('falls back to empty plugin tools when listing xsai tools never resolves during cold start', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    invokeMocks.listPluginXsaiTools.mockImplementationOnce((_req?: undefined, options?: { signal?: AbortSignal }) => new Promise((_, reject) => {
      options?.signal?.addEventListener('abort', () => {
        reject(options.signal?.reason)
      }, { once: true })
    }))

    const llmToolsStore = useLlmToolsStore()
    const store = useTamagotchiPluginToolsStore()
    // ROOT CAUSE:
    //
    // If the renderer asks the main process for plugin xsai tools before the
    // Eventa handler is ready, the invoke promise can remain pending forever.
    // The tool refresh never completes, so the leader cannot finish startup.
    //
    // Before the fix, this wait never settled.
    //
    // We fixed this by letting optional plugin tool listing time out and
    // complete registration with an empty tool list.
    const refresh = store.refresh()

    await Promise.resolve()
    expect(llmToolsStore.tools.filter(tool => tool.id.startsWith('plugin:'))).toEqual([])

    await vi.advanceTimersByTimeAsync(5_000)
    await refresh

    expect(llmToolsStore.tools.filter(tool => tool.id.startsWith('plugin:'))).toEqual([])
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[plugin-tools] Failed to list plugin xsai tools'),
    )
  })
})
