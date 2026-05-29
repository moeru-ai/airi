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
        ownerPluginId: 'plugin-chess',
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
        ownerPluginId: 'plugin-chess',
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
  const { useTamagotchiPluginToolsStore } = await import('./plugin-tools')

  beforeEach(() => {
    setActivePinia(createPinia())
    invokeMocks.listPluginXsaiTools.mockClear()
    invokeMocks.invokePluginTool.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /**
   * @example
   * await store.refresh()
   * expect(llmToolsStore.toolsByProvider['plugin-tools']).toHaveLength(1)
   */
  it('loads plugin xsai tools, proxies execution, and clears them from the shared llm-tools store', async () => {
    const llmToolsStore = useLlmToolsStore()
    const llmToolsetPromptsStore = useLlmToolsetPromptsStore()
    const store = useTamagotchiPluginToolsStore()
    const toolOptions = {} as Parameters<Tool['execute']>[1]

    await store.refresh()

    const pluginTools = llmToolsStore.toolsByProvider['plugin-tools']
    const playChessTool = pluginTools?.find(tool => tool.function.name === 'play_chess')

    expect(pluginTools).toEqual([
      expect.objectContaining({ function: expect.objectContaining({ name: 'play_chess' }) }),
    ])
    expect(llmToolsetPromptsStore.activeToolsetPrompt).toContain('Do not pass fen or pgn when mode is "new".')

    const executionResult = await playChessTool?.execute({
      move: 'e2e4',
    }, toolOptions)

    expect(invokeMocks.invokePluginTool).toHaveBeenCalledWith({
      ownerPluginId: 'plugin-chess',
      name: 'play_chess',
      input: {
        move: 'e2e4',
      },
    })
    expect(executionResult).toEqual({
      ownerPluginId: 'plugin-chess',
      name: 'play_chess',
      input: {
        move: 'e2e4',
      },
    })

    store.dispose()

    expect(llmToolsStore.toolsByProvider['plugin-tools']).toBeUndefined()
    expect(llmToolsetPromptsStore.promptsByProvider['plugin-tools']).toBeUndefined()
  })

  /**
   * @example
   * await store.refresh()
   * await vi.advanceTimersByTimeAsync(5_000)
   * await llmToolsStore.awaitPendingRegistrations()
   */
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
    const onSettled = vi.fn()

    // ROOT CAUSE:
    //
    // If the renderer asks the main process for plugin xsai tools before the
    // Eventa handler is ready, the invoke promise can remain pending forever.
    // The shared LLM store then waits in awaitPendingRegistrations() before
    // building chat tools, so no model HTTP request is sent and chat sync
    // eventually times out.
    //
    // Before the fix, this wait never settled.
    //
    // We fixed this by letting optional plugin tool listing time out and
    // complete registration with an empty tool list.
    store.refresh()
    const pendingRegistrations = llmToolsStore.awaitPendingRegistrations().then(() => {
      onSettled()
    })

    await Promise.resolve()

    expect(onSettled).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5_000)
    await pendingRegistrations

    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(llmToolsStore.toolsByProvider['plugin-tools']).toEqual([])
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[plugin-tools] Failed to list plugin xsai tools'),
    )
  })
})
