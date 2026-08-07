import type { Tool } from '@xsai/shared-chat'

import type { ExecutableTool, ToolDefinition } from './llm-tools'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useLlmToolsStore } from './llm-tools'

function createExecutableTool(id: string, name = id): ExecutableTool {
  return {
    id,
    type: 'function',
    function: {
      name,
      description: `Execute ${name}.`,
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    execute: vi.fn(async () => ({ ok: true })),
  }
}

describe('useLlmToolsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('stores serializable definitions and keeps executors outside Pinia state', async () => {
    const store = useLlmToolsStore()
    const executableTool = createExecutableTool('plugin:chess:play', 'play_chess')
    const toolOptions = {} as Parameters<Tool['execute']>[1]

    store.addTools(executableTool)

    expect(store.tools).toEqual([{
      id: 'plugin:chess:play',
      type: 'function',
      function: {
        name: 'play_chess',
        description: 'Execute play_chess.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    }])
    expect(JSON.stringify(store.$state)).not.toContain('execute')
    await expect(store.activeTools[0]?.execute({}, toolOptions)).resolves.toEqual({ ok: true })
  })

  it('replaces a tool with the same id and keeps its list position', () => {
    const store = useLlmToolsStore()
    const first = createExecutableTool('plugin:chess:play', 'play_chess')
    const second = createExecutableTool('plugin:chess:play', 'play_chess_v2')
    const other = createExecutableTool('mcp:list', 'builtIn_mcpListTools')

    store.addTools(first, other)
    store.addTools(second)

    expect(store.tools.map(tool => tool.id)).toEqual([
      'plugin:chess:play',
      'mcp:list',
    ])
    expect(store.tools[0]?.function.name).toBe('play_chess_v2')
    expect(store.activeTools[0]?.execute).toBe(second.execute)
  })

  it('removes one or many tools by id', () => {
    const store = useLlmToolsStore()
    store.addTools(
      createExecutableTool('plugin:chess:play'),
      createExecutableTool('plugin:chess:reset'),
      createExecutableTool('mcp:list'),
    )

    store.removeToolById('plugin:chess:play')
    expect(store.tools.map(tool => tool.id)).toEqual([
      'plugin:chess:reset',
      'mcp:list',
    ])

    store.removeToolsByIds('plugin:chess:reset', 'mcp:list')
    expect(store.tools).toEqual([])
    expect(store.activeTools).toEqual([])
  })

  it('returns an unavailable executor when synchronized state has no local executor', () => {
    const store = useLlmToolsStore()
    const definition: ToolDefinition = {
      id: 'plugin:chess:play',
      type: 'function',
      function: {
        name: 'play_chess',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    }
    const toolOptions = {} as Parameters<Tool['execute']>[1]

    store.$patch((state) => {
      state.tools = [definition]
    })

    expect(store.activeTools[0]?.execute({}, toolOptions)).toBe('Tool "play_chess" is not available now.')
  })

  it('keeps explicit tools out of the default list and resolves them by name', () => {
    const store = useLlmToolsStore()
    const defaultTool = createExecutableTool('plugin:chess:play', 'play_chess')
    const explicitTool = {
      ...createExecutableTool('tamagotchi:journal', 'image_journal'),
      defaultActive: false,
    }

    store.addTools(defaultTool, explicitTool)

    expect(store.activeTools.map(tool => tool.function.name)).toEqual(['play_chess'])
    expect(store.getToolsByNames('image_journal').map(tool => tool.function.name)).toEqual(['image_journal'])
  })
})
