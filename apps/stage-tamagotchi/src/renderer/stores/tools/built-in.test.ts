import type { Tool } from '@xsai/shared-chat'

import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/llm-tools'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function executableTool(name: string): Tool {
  return {
    type: 'function',
    function: {
      name,
      parameters: { type: 'object', properties: {} },
    },
    execute: vi.fn(),
  }
}

vi.mock('./builtin/image-journal', () => ({
  imageJournalTools: vi.fn(async () => [executableTool('image_journal')]),
}))
vi.mock('./builtin/weather', () => ({
  weatherTools: vi.fn(async () => [executableTool('get_weather')]),
}))
vi.mock('./builtin/widgets', () => ({
  widgetsTools: vi.fn(async () => [executableTool('stage_widgets')]),
}))

describe('useTamagotchiBuiltinToolsStore', async () => {
  const { useTamagotchiBuiltinToolsStore } = await import('./built-in')

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('registers built-in executors as request-selected tools', async () => {
    const toolsStore = useLlmToolsStore()

    await useTamagotchiBuiltinToolsStore().refresh()

    expect(toolsStore.activeTools).toEqual([])
    expect(toolsStore.tools.map(tool => ({
      id: tool.id,
      defaultActive: tool.defaultActive,
    }))).toEqual([
      { id: 'tamagotchi:image_journal', defaultActive: false },
      { id: 'tamagotchi:stage_widgets', defaultActive: false },
      { id: 'tamagotchi:get_weather', defaultActive: false },
    ])
    expect(toolsStore.getToolsByNames('get_weather')[0]?.function.name).toBe('get_weather')
  })
})
