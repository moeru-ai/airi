import type { Tool } from '@xsai/shared-chat'

import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/llm-tools'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMocks = vi.hoisted(() => ({
  invokePluginTool: vi.fn(async (payload: unknown) => payload),
  listPluginXsaiTools: vi.fn(async () => [
    {
      ownerPluginId: 'plugin-chess',
      name: 'play_chess',
      description: 'Play a chess move.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  ]),
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

  /**
   * @example
   * await store.refresh()
   * expect(llmToolsStore.toolsByProvider['plugin-tools']).toHaveLength(1)
   */
  it('loads plugin xsai tools, proxies execution, and clears them from the shared llm-tools store', async () => {
    const llmToolsStore = useLlmToolsStore()
    const store = useTamagotchiPluginToolsStore()
    const toolOptions = {} as Parameters<Tool['execute']>[1]

    await store.refresh()

    const pluginTools = llmToolsStore.toolsByProvider['plugin-tools']
    const playChessTool = pluginTools?.find(tool => tool.function.name === 'play_chess')

    expect(pluginTools).toEqual([
      expect.objectContaining({ function: expect.objectContaining({ name: 'play_chess' }) }),
    ])

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
  })
})
