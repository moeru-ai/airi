import type { Tool } from '@xsai/shared-chat'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useWebSearchStore } from '../../modules/web-search'
import { resolveLlmTools, toolNameFrom } from './tool-resolver'

// The default (non-injected) spark-command branch reads the channel store. Mock
// it so the test observes the exact event the tool hands to the socket, without
// a live connection and without Pinia.
const { sendSparkCommandEventMock, useModsServerChannelStoreMock } = vi.hoisted(() => ({
  sendSparkCommandEventMock: vi.fn((_event: { type: string, data: Record<string, unknown> }) => undefined),
  useModsServerChannelStoreMock: vi.fn(),
}))

vi.mock('../../mods/api/channel-server', () => ({
  useModsServerChannelStore: useModsServerChannelStoreMock,
}))

function createTool(name: string, description = `${name} description`): Tool {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
    execute: vi.fn(),
  } as Tool
}

// The resolver wraps every tool with the call summary, so a resolved tool reads as its source by its description.
function descriptionsOf(tools: Tool[]) {
  return tools.map(tool => tool.function.description)
}

describe('toolNameFrom', () => {
  it('reads function.name', () => {
    expect(toolNameFrom(createTool('runtime_read_context'))).toBe('runtime_read_context')
  })
})

describe('resolveLlmTools', () => {
  // https://github.com/moeru-ai/airi/issues/2779
  // ROOT CAUSE:
  //
  // The default source added MCP proxies without a transport.
  // We fixed this by keeping the default source empty and retaining runtime registrations.
  it('exposes MCP proxies only from a registered runtime (Issue #2779)', async () => {
    const options = { debugTools: [], sparkCommandTools: [], webSearchTools: [], activeTools: [] }

    expect(await resolveLlmTools(options)).toEqual([])

    const listTools = createTool('builtIn_mcpListTools')
    const callTool = createTool('builtIn_mcpCallTool')

    expect(descriptionsOf(await resolveLlmTools({ ...options, activeTools: [listTools, callTool] }))).toEqual(descriptionsOf([listTools, callTool]))
  })

  it('reads the images of every tool when it receives an image reader', async () => {
    const screenshot = [{ type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } }]
    const builtInTool = { ...createTool('builtIn_mcpCallTool'), execute: async () => screenshot }
    const customTool = { ...createTool('computer_use_read_image'), execute: async () => screenshot }
    const describeImage = vi.fn(async () => 'A window.')

    const tools = await resolveLlmTools({
      builtInTools: [builtInTool],
      debugTools: [],
      sparkCommandTools: [],
      webSearchTools: [],
      customTools: [customTool],
      activeTools: [],
      describeImage,
    })
    const results = await Promise.all(tools.map(tool => tool.execute({}, { messages: [], toolCallId: 'call-1' })))

    expect(results).toEqual([
      [expect.objectContaining({ type: 'text' })],
      [expect.objectContaining({ type: 'text' })],
    ])
    expect(describeImage).toHaveBeenCalledTimes(2)
  })

  it('prefers a later runtime tool with the same name over an earlier built-in tool', async () => {
    const builtInTool = createTool('duplicate_tool', 'Built-in version.')
    const runtimeTool = createTool('duplicate_tool', 'Runtime version.')

    const tools = await resolveLlmTools({
      builtInTools: [builtInTool],
      debugTools: [],
      sparkCommandTools: [],
      webSearchTools: [],
      activeTools: [runtimeTool],
    })

    expect(tools).toHaveLength(1)
    expect(tools[0]?.function.description).toBe(runtimeTool.function.description)
  })

  it('places custom tools before active runtime tools so runtime tools can win by name', async () => {
    const builtInTool = createTool('built_in_tool')
    const customTool = createTool('duplicate_tool', 'Custom version.')
    const runtimeTool = createTool('duplicate_tool', 'Runtime version.')

    const tools = await resolveLlmTools({
      builtInTools: [builtInTool],
      debugTools: [],
      sparkCommandTools: [],
      webSearchTools: [],
      customTools: [customTool],
      activeTools: [runtimeTool],
    })

    expect(descriptionsOf(tools)).toEqual(descriptionsOf([builtInTool, runtimeTool]))
  })

  it('includes injected web-search tools in the resolved list', async () => {
    const builtInTool = createTool('built_in_tool')
    const webSearchTool = createTool('web_search')

    const tools = await resolveLlmTools({
      builtInTools: [builtInTool],
      debugTools: [],
      sparkCommandTools: [],
      webSearchTools: [webSearchTool],
      activeTools: [],
    })

    expect(descriptionsOf(tools)).toEqual(descriptionsOf([builtInTool, webSearchTool]))
  })

  describe('default web-search branch (module store gate)', () => {
    let pinia: ReturnType<typeof createPinia>

    beforeEach(() => {
      pinia = createPinia()
      setActivePinia(pinia)
    })

    afterEach(() => {
      disposePinia(pinia)
      vi.unstubAllGlobals()
    })

    it('omits web_search when the selected service is not configured', async () => {
      const store = useWebSearchStore()
      store.enabled = true
      store.apiKey = 'tavily-key'
      store.provider = 'deepseek'
      const builtInTool = createTool('built_in_tool')
      const tools = await resolveLlmTools({
        builtInTools: [builtInTool],
        debugTools: [],
        sparkCommandTools: [],
        activeTools: [],
      })
      expect(descriptionsOf(tools)).toEqual(descriptionsOf([builtInTool]))
    })

    it.each(['tavily', 'deepseek'] as const)('uses the trimmed key of %s through the resolved tool', async (provider) => {
      const store = useWebSearchStore()
      store.enabled = true
      store.apiKey = '  tavily-key\n'
      store.deepSeekApiKey = '  deepseek-key\n'
      store.provider = provider
      const request = vi.fn<typeof fetch>(async () => Response.json({ results: [] }))
      vi.stubGlobal('fetch', request)
      const tools = await resolveLlmTools({
        builtInTools: [],
        debugTools: [],
        sparkCommandTools: [],
        activeTools: [],
      })
      expect(tools.map(toolNameFrom)).toEqual(['web_search'])
      await tools[0]!.execute({ query: 'news', max_results: null, call_summary: 'Search news', call_icon: ['search'] }, { messages: [], toolCallId: 'search' })
      expect(request).toHaveBeenCalledTimes(1)
      expect(request.mock.calls[0]![0]).toBe(provider === 'deepseek' ? 'https://api.deepseek.com/v1/tools/search' : 'https://api.tavily.com/search')
      expect(request.mock.calls[0]![1]?.headers).toMatchObject({ authorization: `Bearer ${provider}-key` })
    })
  })

  describe('default spark-command branch (channel store)', () => {
    beforeEach(() => {
      sendSparkCommandEventMock.mockReset()
      useModsServerChannelStoreMock.mockReset()
      useModsServerChannelStoreMock.mockReturnValue({ send: sendSparkCommandEventMock })
    })

    async function resolveSparkCommandTool() {
      // sparkCommandTools is intentionally omitted so resolveSparkCommandTools
      // falls through to the real sender instead of an injected source.
      const tools = await resolveLlmTools({
        builtInTools: [],
        debugTools: [],
        webSearchTools: [],
        customTools: [],
        activeTools: [],
      })
      const tool = tools.find(candidate => toolNameFrom(candidate) === 'builtIn_emitSparkCommand')
      if (!tool)
        throw new Error('Expected the resolver to mount builtIn_emitSparkCommand.')

      return tool
    }

    it('omits destinations from the emitted event so the server broadcasts', async () => {
      const tool = await resolveSparkCommandTool()

      const result = await tool.execute({
        destinations: ['minecraft-bot'],
        interrupt: null,
        priority: null,
        intent: 'action',
        ack: null,
        parentEventId: null,
        guidance: null,
        contexts: null,
      }, { messages: [], toolCallId: 'call-spark-command' })

      expect(sendSparkCommandEventMock).toHaveBeenCalledOnce()
      const [event] = sendSparkCommandEventMock.mock.calls[0]
      expect(event.type).toBe('spark:command')
      // The delivery loop keeps an array-shaped `data.destinations` and delivers to the peers it
      // names, so an empty array reaches nobody. Only an absent key broadcasts.
      //
      // Regression guard for a5d45bdd7 (#1635). The previous `destinations = []` predates it.
      expect(Object.hasOwn(event.data, 'destinations')).toBe(false)
      expect(result).toContain('broadcast')
    })
  })
})
