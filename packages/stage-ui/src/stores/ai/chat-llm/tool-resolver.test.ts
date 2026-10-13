import type { Tool } from '@xsai/shared-chat'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAgentPermissionStore } from '../../agent-permissions'
import { configureToolGate } from './agent-gate'
import { resolveLlmTools, toolNameFrom } from './tool-resolver'

// The permission gate wraps every resolved tool and reads the settings at
// module scope. A fresh Pinia keeps the approval queue of one test out of the
// next, and every call here runs under the default guarded policy.
beforeEach(() => {
  setActivePinia(createPinia())
  configureToolGate(undefined)
})

// The default (non-injected) web-search branch reads the module store and the
// tools barrel; mock both so the configured-gate + key-trim logic can be
// exercised without real Pinia state or a live Tavily factory.
const { createWebSearchToolsMock, useWebSearchStoreMock } = vi.hoisted(() => ({
  createWebSearchToolsMock: vi.fn(),
  useWebSearchStoreMock: vi.fn(),
}))

vi.mock('../../../tools', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, createWebSearchTools: createWebSearchToolsMock }
})

vi.mock('../../modules/web-search', () => ({
  useWebSearchStore: useWebSearchStoreMock,
}))

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

describe('toolNameFrom', () => {
  it('reads function.name', () => {
    expect(toolNameFrom(createTool('runtime_read_context'))).toBe('runtime_read_context')
  })
})

describe('resolveLlmTools', () => {
  it('reads the images of every tool when it receives an image reader', async () => {
    const screenshot = [{ type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } }]
    const builtInTool = { ...createTool('builtIn_mcpCallTool'), execute: async () => screenshot }
    const customTool = { ...createTool('computer_use_read_image'), execute: async () => screenshot }
    const describeImage = vi.fn(async () => 'A window.')
    // This case reads the image handling of both decorators, so it runs without
    // a confirmation. The gate itself has its own cases below.
    configureToolGate({ fullAccess: true })

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
    // The permission gate wraps the winning tool, so the identity changes while
    // the name and the precedence stay the same.
    expect(toolNameFrom(tools[0])).toBe('duplicate_tool')
    expect(tools[0].function.description).toBe('Runtime version.')
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

    // The gate wraps every tool, so compare the names, the order and the winner.
    expect(tools.map(toolNameFrom)).toEqual(['built_in_tool', 'duplicate_tool'])
    expect(tools[1].function.description).toBe('Runtime version.')
  })

  it('wraps every resolved tool so its calls pass the permission gate', async () => {
    const customTool = createTool('computer_use')
    const execute = vi.fn(async () => 'done')
    customTool.execute = execute

    const tools = await resolveLlmTools({
      builtInTools: [],
      debugTools: [],
      sparkCommandTools: [],
      webSearchTools: [],
      customTools: [customTool],
      activeTools: [],
    })

    // A high-risk call waits for the user, so the tool stays unread until then.
    const pending = tools[0].execute({ argv: ['invoke', 'input.click'] }, { messages: [], toolCallId: 'call-gated' })
    await Promise.resolve()

    const permissions = useAgentPermissionStore()
    expect(execute).not.toHaveBeenCalled()
    expect(permissions.activeRequest?.toolName).toBe('computer_use')

    permissions.resolveActive(true)
    await expect(pending).resolves.toBe('done')
    expect(execute).toHaveBeenCalledOnce()
  })

  it('answers a denied call with a refusal instead of running the tool', async () => {
    const customTool = createTool('computer_use')
    const execute = vi.fn(async () => 'done')
    customTool.execute = execute

    const tools = await resolveLlmTools({
      builtInTools: [],
      debugTools: [],
      sparkCommandTools: [],
      webSearchTools: [],
      customTools: [customTool],
      activeTools: [],
    })

    const pending = tools[0].execute({ argv: ['invoke', 'input.click'] }, { messages: [], toolCallId: 'call-denied' })
    await Promise.resolve()

    useAgentPermissionStore().resolveActive(false)
    await expect(pending).resolves.toContain('denied')
    expect(execute).not.toHaveBeenCalled()
  })

  it('runs a low-risk call without a confirmation', async () => {
    const customTool = createTool('computer_use')
    const execute = vi.fn(async () => 'done')
    customTool.execute = execute

    const tools = await resolveLlmTools({
      builtInTools: [],
      debugTools: [],
      sparkCommandTools: [],
      webSearchTools: [],
      customTools: [customTool],
      activeTools: [],
    })

    await expect(
      tools[0].execute({ argv: ['invoke', 'display.screenshot'] }, { messages: [], toolCallId: 'call-read' }),
    ).resolves.toBe('done')
    expect(execute).toHaveBeenCalledOnce()
  })

  it('runs a high-risk call without a confirmation under full access', async () => {
    configureToolGate({ fullAccess: true })
    const customTool = createTool('computer_use')
    const execute = vi.fn(async () => 'done')
    customTool.execute = execute

    const tools = await resolveLlmTools({
      builtInTools: [],
      debugTools: [],
      sparkCommandTools: [],
      webSearchTools: [],
      customTools: [customTool],
      activeTools: [],
    })

    await expect(
      tools[0].execute({ argv: ['invoke', 'input.click'] }, { messages: [], toolCallId: 'call-full' }),
    ).resolves.toBe('done')
    expect(execute).toHaveBeenCalledOnce()
    // Full access answers without a dialog, so no call waits.
    expect(useAgentPermissionStore().activeRequest).toBeUndefined()
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

    expect(tools.map(toolNameFrom)).toEqual(['built_in_tool', 'web_search'])
  })

  describe('default web-search branch (module store gate)', () => {
    beforeEach(() => {
      createWebSearchToolsMock.mockReset()
      useWebSearchStoreMock.mockReset()
    })

    it('omits web_search when the web-search module is not configured', async () => {
      useWebSearchStoreMock.mockReturnValue({ configured: false, apiKey: '' })
      const builtInTool = createTool('built_in_tool')

      // webSearchTools is intentionally omitted so resolveWebSearchTools falls
      // through to the module store instead of the injected source.
      const tools = await resolveLlmTools({
        builtInTools: [builtInTool],
        debugTools: [],
        sparkCommandTools: [],
        activeTools: [],
      })

      expect(tools.map(toolNameFrom)).toEqual(['built_in_tool'])
      expect(createWebSearchToolsMock).not.toHaveBeenCalled()
    })

    it('mounts web_search with a trimmed key when the module is configured', async () => {
      const webSearchTool = createTool('web_search')
      createWebSearchToolsMock.mockResolvedValue([webSearchTool])
      // A key pasted with surrounding whitespace still reads as configured, so
      // the resolver must trim it before handing it to the factory.
      useWebSearchStoreMock.mockReturnValue({ configured: true, apiKey: '  tvly-key\n' })
      const builtInTool = createTool('built_in_tool')

      const tools = await resolveLlmTools({
        builtInTools: [builtInTool],
        debugTools: [],
        sparkCommandTools: [],
        activeTools: [],
      })

      expect(createWebSearchToolsMock).toHaveBeenCalledWith({ apiKey: 'tvly-key' })
      // The gate wraps every tool, so compare the names and the order.
      expect(tools.map(toolNameFrom)).toEqual(['built_in_tool', 'web_search'])
    })
  })

  describe('default spark-command branch (channel store)', () => {
    beforeEach(() => {
      sendSparkCommandEventMock.mockReset()
      useModsServerChannelStoreMock.mockReset()
      useModsServerChannelStoreMock.mockReturnValue({ send: sendSparkCommandEventMock })
      // A spark command is a medium-risk call. This branch tests the event
      // payload, not the confirmation, so it runs under the relaxed policy.
      configureToolGate({ autoApproveMedium: true })
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
