import type { GenerationProvider } from '@proj-airi/provider-inference'
import type { JsonSchema } from 'xsschema'

import type { McpToolRuntime } from './mcp'

import { streamFrom } from '@proj-airi/core-agent'
import { describe, expect, it, vi } from 'vitest'

import { withDescribedImages } from '../stores/ai/chat-llm/tool-images'
import { createMcpTools, mcp, MCP_AGENT_EXECUTION_PROMPT, MCP_CALL_TOOL_NAME, MCP_LIST_TOOL_NAME } from './mcp'

function createRuntime(): McpToolRuntime {
  return {
    listTools: vi.fn(async () => []),
    callTool: vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] })),
  }
}

describe('mcp tool images', () => {
  it.each(['chat-completions', 'responses'] as const)('sends a screenshot as an image on the next %s request', async (protocol) => {
    const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pP8WwAAAABJRU5ErkJggg=='
    const imageUrl = `data:image/png;base64,${data}`
    const metadata = { structuredContent: { frame: { width: 1, height: 1 } }, dispatchOutcome: 'response_received' } as const
    const direct = [{ serverName: 'airi-terminal', name: 'airi-terminal::computer_observe', toolName: 'computer_observe', exposure: 'direct', inputSchema: { type: 'object', properties: {} } }] as const
    const runtime = createRuntime()
    vi.mocked(runtime.callTool).mockResolvedValue({
      ...metadata,
      content: [{ type: 'text', text: 'Display captured.' }, { type: 'image', data, mimeType: 'image/png' }],
    })
    const tools = await createMcpTools(runtime, { direct })
    const requests: Record<string, unknown>[][] = []
    const call = { name: 'computer_observe', arguments: '{}' }
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body))
      requests.push(protocol === 'responses' ? request.input : request.messages)
      const first = requests.length === 1
      const output = first ? [{ type: 'function_call', call_id: 'observe-1', ...call }] : []
      const events = protocol === 'responses'
        ? [...output.map(item => ({ type: 'response.output_item.done', item })), { type: 'response.completed', response: { output } }]
        : [{ choices: [{ index: 0, delta: first
            ? { tool_calls: [{ index: 0, id: 'observe-1', type: 'function', function: call }] }
            : { content: 'Done.' }, finish_reason: first ? 'tool_calls' : 'stop' }] }]
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
    }
    const chatProvider: GenerationProvider = { generation: model => protocol === 'responses'
      ? { protocol, webSearch: false, config: { model, baseURL: 'https://example.com/v1/', fetch } }
      : { protocol, config: { model, baseURL: 'https://example.com/v1/', fetch } } }

    await streamFrom({ model: 'fixture', chatProvider, conversation: { turns: [] }, options: {
      tools,
      prepareConversation: async context => context,
    } })

    expect(requests).toHaveLength(2)
    const response = requests[1].find(item => protocol === 'responses' ? item.call_id === 'observe-1' && item.type === 'function_call_output' : item.tool_call_id === 'observe-1')
    const textType = protocol === 'responses' ? 'input_text' : 'text'
    expect(response?.[protocol === 'responses' ? 'output' : 'content']).toEqual([
      { type: textType, text: 'Display captured.' },
      protocol === 'responses' ? { type: 'input_image', image_url: imageUrl } : { type: 'image_url', image_url: { url: imageUrl } },
      { type: textType, text: JSON.stringify(metadata) },
    ])
    expect(JSON.stringify(requests[1]).split(data)).toHaveLength(2)
  })

  it('lets the vision model describe an image returned through the MCP router', async () => {
    const runtime = createRuntime()
    vi.mocked(runtime.callTool).mockResolvedValue({ content: [{ type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' }] })
    const tools = await createMcpTools(runtime, { proxy: 'active' })
    const proxy = tools.find(tool => tool.function.name === MCP_CALL_TOOL_NAME)!
    const describe = vi.fn(async () => 'A settings window.')
    const result = await withDescribedImages(proxy, describe).execute({ name: 'fixture::capture', arguments: '{}' }, { messages: [], toolCallId: 'describe' })

    expect(describe).toHaveBeenCalledExactlyOnceWith('data:image/png;base64,aW1hZ2U=')
    expect(result).toEqual([{ type: 'text', text: '[Image description from the vision model]\nA settings window.\n[End image description]' }])
  })
})

describe('mcp Agent execution prompt', () => {
  it('keeps scoped app lists and dry-run evidence from ending an available task early', () => {
    expect(MCP_AGENT_EXECUTION_PROMPT).toContain('The Agent runtime compacts conversation context. The bundled Computer Use path provides AUV desktop observation and input plus Terminal process control.')
    expect(MCP_AGENT_EXECUTION_PROMPT).toContain('Use stable computer_* and terminal_exec tools first.')
    expect(MCP_AGENT_EXECUTION_PROMPT).toContain('A supported-app list names apps accepted by desktop open and focus tools.')
    expect(MCP_AGENT_EXECUTION_PROMPT).toContain('Inspect running processes and known install paths with available Terminal or process tools.')
    expect(MCP_AGENT_EXECUTION_PROMPT).toContain('Use paths from the user and prior observations before default install paths.')
    expect(MCP_AGENT_EXECUTION_PROMPT).toContain('inspect registered app paths, Start Menu shortcuts, and known library roots')
    expect(MCP_AGENT_EXECUTION_PROMPT).toContain('Never use it to emulate mouse or keyboard input or bypass Host approval.')
    expect(MCP_AGENT_EXECUTION_PROMPT).toContain('Continue with non-GUI discovery and approved launch steps.')
    expect(MCP_AGENT_EXECUTION_PROMPT).toContain('External MCP tools are Host-selected and can be injected on demand.')
    expect(MCP_AGENT_EXECUTION_PROMPT).toContain('Complete safe, authorized steps and verify their effects before you report a blocker for later gameplay.')
    expect(MCP_AGENT_EXECUTION_PROMPT).toContain('Do not claim that a requested app is unavailable or a game cannot be played based only on a supported-app list.')
    expect(MCP_AGENT_EXECUTION_PROMPT).toContain('Do not repeat an action after a lost or unclear result. Inspect the current state first.')
  })
})

describe('tools mcp schema', () => {
  it('keeps generic MCP routing out of the default Agent catalog', async () => {
    const direct = [{ serverName: 'fixture', name: 'fixture::terminal_exec', toolName: 'terminal_exec', exposure: 'direct', inputSchema: { type: 'object', properties: {} } }] as const

    expect((await createMcpTools(createRuntime(), { direct })).map(tool => tool.function.name)).toEqual(['terminal_exec'])
  })

  it('registers the secondary route only when the Host opts in', async () => {
    const tools = await createMcpTools(createRuntime(), { proxy: 'explicit' })
    const list = tools.find(tool => tool.function.name === 'builtIn_mcpListTools')
    const call = tools.find(tool => tool.function.name === 'builtIn_mcpCallTool')

    expect(list).toMatchObject({ defaultActive: false, requiresExplicitSelection: true })
    expect(call).toMatchObject({ defaultActive: false, requiresExplicitSelection: true })
  })

  it('limits secondary MCP routing to Host-selected servers while preserving direct tools', async () => {
    const runtime = createRuntime()
    const bundledComputerAct = {
      serverName: 'airi-terminal',
      name: 'airi-terminal::computer_act',
      toolName: 'computer_act',
      exposure: 'direct',
      inputSchema: { type: 'object', properties: {} },
    } as const
    const bundledDesktopClick = {
      serverName: 'airi-terminal',
      name: 'airi-terminal::desktop_click',
      toolName: 'desktop_click',
      exposure: 'router-only',
      inputSchema: { type: 'object', properties: {} },
    } as const
    const externalSearch = {
      serverName: 'filesystem',
      name: 'filesystem::search',
      toolName: 'search',
      exposure: 'router-only',
      inputSchema: { type: 'object', properties: {} },
    } as const
    vi.mocked(runtime.listTools).mockResolvedValue([bundledDesktopClick, externalSearch])

    const tools = await createMcpTools(runtime, {
      direct: [bundledComputerAct],
      proxy: 'explicit',
      proxyServers: ['filesystem'],
    })
    const list = tools.find(tool => tool.function.name === MCP_LIST_TOOL_NAME)!
    const call = tools.find(tool => tool.function.name === MCP_CALL_TOOL_NAME)!
    const computerAct = tools.find(tool => tool.function.name === 'computer_act')!

    expect(await list.execute({ name: null }, { messages: [], toolCallId: 'list' })).toEqual([externalSearch])
    expect(await call.execute({ name: bundledDesktopClick.name, arguments: '{}' }, { messages: [], toolCallId: 'blocked' }))
      .toMatchObject({ isError: true })
    expect(runtime.callTool).not.toHaveBeenCalled()

    await computerAct.execute({}, { messages: [], toolCallId: 'direct' })

    expect(runtime.callTool).toHaveBeenCalledExactlyOnceWith(
      { name: bundledComputerAct.name, arguments: {} },
      expect.objectContaining({ toolCallId: 'direct' }),
    )
  })

  it('namespaces colliding direct tool names without changing unique entrypoints', async () => {
    const runtime = createRuntime()
    const tools = await createMcpTools(runtime, {
      direct: [
        {
          serverName: 'airi-terminal',
          name: 'airi-terminal::computer_observe',
          toolName: 'computer_observe',
          exposure: 'direct',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          serverName: 'first',
          name: 'first::search',
          toolName: 'search',
          exposure: 'direct',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          serverName: 'second',
          name: 'second::search',
          toolName: 'search',
          exposure: 'direct',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    })

    expect(tools.map(tool => tool.function.name)).toEqual([
      'computer_observe',
      'mcp__first__search',
      'mcp__second__search',
    ])

    await tools.find(tool => tool.function.name === 'mcp__second__search')?.execute({}, { messages: [], toolCallId: 'collision' })
    expect(runtime.callTool).toHaveBeenCalledWith(
      { name: 'second::search', arguments: {} },
      expect.objectContaining({ toolCallId: 'collision' }),
    )
  })

  it('emits strict parameter objects', async () => {
    const tools = await createMcpTools(createRuntime(), { proxy: 'active' })
    for (const name of ['builtIn_mcpListTools', 'builtIn_mcpCallTool']) {
      const t = tools.find(entry => entry.function.name === name)
      expect(t, `missing tool: ${name}`).toBeDefined()
      expect(t?.function.parameters.additionalProperties).toBe(false)
    }
  })

  it('builtIn_mcpCallTool uses flat name+arguments schema', async () => {
    const tools = await createMcpTools(createRuntime(), { proxy: 'active' })
    const callTool = tools.find(entry => entry.function.name === 'builtIn_mcpCallTool')
    expect(callTool).toBeDefined()

    const props = (callTool!.function.parameters as JsonSchema).properties!
    expect((props.name as JsonSchema).type).toBe('string')
    expect((props.arguments as JsonSchema).type).toBe('string')
  })

  it('describes Computer Use routing and Host-gated GUI use', async () => {
    const [listTools] = await createMcpTools(createRuntime(), { proxy: 'active' })
    expect(listTools.function.description).toContain('Do not call Terminal as a preflight')
    expect(listTools.function.description).toContain('Use Computer Use tools for games, browsers, and GUI tasks')
  })
})

describe('mcp discovery', () => {
  it('exposes only a Host-marked Terminal directly and preserves its runtime execution context', async () => {
    const runtime = createRuntime()
    const descriptors = [
      { serverName: 'owned', name: 'owned::terminal_exec', toolName: 'terminal_exec', exposure: 'direct', description: 'Configured Shell.', inputSchema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'], additionalProperties: false } },
      { serverName: 'owned', name: 'owned::terminal_history', toolName: 'terminal_history', exposure: 'router-only', inputSchema: { type: 'object', properties: {} } },
      { serverName: 'owned', name: 'owned::desktop_capture', toolName: 'desktop_capture', exposure: 'disabled', inputSchema: { type: 'object', properties: {} } },
    ] satisfies Awaited<ReturnType<McpToolRuntime['listTools']>>
    vi.mocked(runtime.listTools).mockResolvedValue(descriptors)
    const tools = await createMcpTools(runtime, { direct: descriptors, proxy: 'active' })
    const terminal = tools.find(tool => tool.function.name === 'terminal_exec')!
    expect(terminal.function.strict).toBe(false)
    expect(terminal.function.parameters).toEqual(descriptors[0].inputSchema)
    expect(runtime.listTools).not.toHaveBeenCalled()
    const options = { messages: [], toolCallId: 'direct-call', attribution: { sessionId: 's', turnId: 't' }, abortSignal: new AbortController().signal }

    expect(tools.map(tool => tool.function.name)).toEqual(['builtIn_mcpListTools', 'builtIn_mcpCallTool', 'terminal_exec'])
    await terminal.execute({ command: 'fixture' }, options)
    expect(runtime.callTool).toHaveBeenCalledExactlyOnceWith({ name: 'owned::terminal_exec', arguments: { command: 'fixture' } }, options)
    const [list] = tools
    expect(await list.execute({}, { messages: [], toolCallId: 'list' })).not.toEqual(expect.arrayContaining([expect.objectContaining({ exposure: 'disabled' })]))
    expect(runtime.callTool).toHaveBeenCalledTimes(1)
  })

  it('retrieves a single current schema without guessing another tool', async () => {
    const runtime = createRuntime()
    const descriptors = [
      { serverName: 'fixture', name: 'fixture::a', toolName: 'a', inputSchema: { type: 'object', properties: { current: { type: 'number' } } } },
      { serverName: 'fixture', name: 'fixture::b', toolName: 'b', inputSchema: { type: 'object', properties: {} } },
    ]
    vi.mocked(runtime.listTools).mockResolvedValue(descriptors)
    const [list] = await createMcpTools(runtime, { proxy: 'active' })
    expect(await list.execute({ name: 'fixture::a' }, { messages: [], toolCallId: 'exact' })).toEqual([descriptors[0]])
    expect(runtime.listTools).toHaveBeenCalledExactlyOnceWith('fixture::a')
    expect(await list.execute({ name: 'fixture::missing' }, { messages: [], toolCallId: 'missing' })).toMatchObject({ isError: true })
    expect(runtime.callTool).not.toHaveBeenCalled()
  })

  it('accepts a null catalog selector and does not retry a direct call after a lost response', async () => {
    const runtime = createRuntime()
    const direct = [{ serverName: 'fixture', name: 'fixture::terminal_exec', toolName: 'terminal_exec', exposure: 'direct', inputSchema: { type: 'object', properties: {} } }] as const
    vi.mocked(runtime.listTools).mockResolvedValue([...direct])
    let effects = 0
    vi.mocked(runtime.callTool).mockImplementation(async () => {
      effects++
      throw new Error('Effect occurred, response lost.')
    })
    const [list, , terminal] = await createMcpTools(runtime, { direct, proxy: 'active' })
    expect(await list.validate!({ name: null })).toEqual({ value: { name: null } })
    expect(await list.execute({ name: null }, { messages: [], toolCallId: 'catalog' })).toEqual(await runtime.listTools())
    expect(await terminal.execute({}, { messages: [], toolCallId: 'once' })).toMatchObject({ isError: true, content: [{ text: 'Effect occurred, response lost.' }] })
    expect(runtime.callTool).toHaveBeenCalledOnce()
    expect(effects).toBe(1)
  })

  it('preserves Host unknown doNotReplay structured content for the model', async () => {
    const runtime = createRuntime()
    const direct = [{ serverName: 'airi-terminal', name: 'airi-terminal::computer_act', toolName: 'computer_act', exposure: 'direct', inputSchema: { type: 'object', properties: {} } }] as const
    vi.mocked(runtime.listTools).mockResolvedValue([...direct])
    vi.mocked(runtime.callTool).mockResolvedValue({
      isError: true,
      content: [{ type: 'text', text: 'The Computer Use action was dispatched before the failure. Its outcome is unknown. Check the current state before repeating it.' }],
      structuredContent: { status: 'unknown', doNotReplay: true, pendingActionId: 'pending-1' },
    })
    const tools = await createMcpTools(runtime, { direct })
    const computerAct = tools.find(tool => tool.function.name === 'computer_act')!

    await expect(computerAct.execute({}, { messages: [], toolCallId: 'once' })).resolves.toMatchObject({
      isError: true,
      structuredContent: { status: 'unknown', doNotReplay: true, pendingActionId: 'pending-1' },
    })
    expect(runtime.callTool).toHaveBeenCalledOnce()
  })

  it('registers direct and discovery tools without starting the catalog request', async () => {
    const runtime = createRuntime()
    vi.mocked(runtime.listTools).mockReturnValue(new Promise(() => {}))
    const direct = [{ serverName: 'fixture', name: 'fixture::terminal_exec', toolName: 'terminal_exec', exposure: 'direct', inputSchema: { type: 'object', properties: {} } }] as const

    const tools = await createMcpTools(runtime, { direct, proxy: 'active' })

    expect(tools.map(tool => tool.function.name)).toEqual(['builtIn_mcpListTools', 'builtIn_mcpCallTool', 'terminal_exec'])
    expect(runtime.listTools).not.toHaveBeenCalled()
    expect(runtime.callTool).not.toHaveBeenCalled()
  })

  it('advertises the connected tool index before the first model choice without dispatching an operation', async () => {
    const runtime = createRuntime()
    vi.mocked(runtime.listTools).mockResolvedValue([{
      serverName: 'fixture',
      name: 'fixture::terminal_exec',
      toolName: 'terminal_exec',
      inputSchema: { type: 'object', properties: {} },
    }])

    const [listTools] = await createMcpTools(runtime, { servers: ['fixture'], proxy: 'active' })

    expect(listTools.function.description).toContain('Servers at registration: ["fixture"]')
    expect(listTools.function.description).not.toContain('fixture::terminal_exec')
    expect(runtime.listTools).not.toHaveBeenCalled()
    expect(runtime.callTool).not.toHaveBeenCalled()

    vi.mocked(runtime.listTools).mockResolvedValue([])
    const result = await listTools.execute({}, { messages: [], toolCallId: 'list-current' })

    expect(result).toBe('No MCP tools are available. Do not retry discovery during this assistant turn.')
    expect(runtime.listTools).toHaveBeenCalledOnce()
    expect(runtime.callTool).not.toHaveBeenCalled()
  })

  // https://github.com/moeru-ai/airi/issues/2779
  // ROOT CAUSE:
  //
  // The default tool set exposed proxies backed by an unavailable MCP runtime.
  // We fixed this by leaving proxy registration to runtimes with an MCP transport.
  it('omits proxy tools without an MCP runtime (Issue #2779)', async () => {
    expect(await mcp()).toEqual([])
  })

  // https://github.com/moeru-ai/airi/issues/2779
  // ROOT CAUSE:
  //
  // An empty descriptor array gave the model no terminal discovery result.
  // We fixed this with an explicit message that asks the model to stop discovery.
  it('reports an empty catalog explicitly (Issue #2779)', async () => {
    const runtime = createRuntime()
    const [listTools] = await createMcpTools(runtime, { proxy: 'active' })

    const result = await listTools.execute({}, { messages: [], toolCallId: 'list-empty' })

    expect(result).toBe('No MCP tools are available. Do not retry discovery during this assistant turn.')
    expect(runtime.listTools).toHaveBeenCalledOnce()
  })

  // https://github.com/moeru-ai/airi/issues/2779
  // ROOT CAUSE:
  //
  // Discovery caught the transport error and returned an empty string.
  // We fixed this with an MCP error result that retains the failure reason.
  it('returns the discovery failure to the model (Issue #2779)', async () => {
    const runtime = createRuntime()
    vi.mocked(runtime.listTools).mockRejectedValue(new Error('MCP connection closed.'))
    const [listTools] = await createMcpTools(runtime, { proxy: 'active' })

    const result = await listTools.execute({}, { messages: [], toolCallId: 'list-failed' })

    expect(result).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'MCP tool discovery failed: MCP connection closed.' }],
    })
    expect(runtime.listTools).toHaveBeenCalledOnce()
  })

  it('retains available tool descriptors and proxies invocation', async () => {
    const runtime = createRuntime()
    const descriptors = [{
      serverName: 'memory',
      name: 'memory::read_graph',
      toolName: 'read_graph',
      description: 'Read the memory graph.',
      inputSchema: { type: 'object', properties: {} },
    }]
    vi.mocked(runtime.listTools).mockResolvedValue(descriptors)
    const [listTools, callTool] = await createMcpTools(runtime, { proxy: 'active' })

    expect(await listTools.execute({}, { messages: [], toolCallId: 'list-success' })).toEqual(descriptors)
    expect(await callTool.execute({ name: 'memory::read_graph', arguments: '{}' }, { messages: [], toolCallId: 'call-success' }))
      .toEqual({ content: [{ type: 'text', text: 'ok' }] })
    expect(runtime.callTool).toHaveBeenCalledWith({ name: 'memory::read_graph', arguments: {} }, expect.objectContaining({ toolCallId: 'call-success' }))
  })

  it('retains invocation failures as MCP error results', async () => {
    const runtime = createRuntime()
    vi.mocked(runtime.listTools).mockResolvedValue([{ serverName: 'memory', name: 'memory::missing', toolName: 'missing', inputSchema: { type: 'object', properties: {} } }])
    vi.mocked(runtime.callTool).mockRejectedValue(new Error('Unknown tool.'))
    const [, callTool] = await createMcpTools(runtime, { proxy: 'active' })

    const result = await callTool.execute({ name: 'memory::missing', arguments: '{}' }, { messages: [], toolCallId: 'call-failed' })

    expect(result).toEqual({
      dispatchOutcome: 'outcome_unknown',
      isError: true,
      content: [{ type: 'text', text: 'Unknown tool.' }],
    })
  })

  it('marks malformed arguments as failed before dispatch', async () => {
    const runtime = createRuntime()
    const [, callTool] = await createMcpTools(runtime, { proxy: 'active' })

    const result = await callTool.execute({ name: 'memory::write', arguments: '{' }, { messages: [], toolCallId: 'invalid-arguments' })

    expect(result).toMatchObject({
      dispatchOutcome: 'failed_before_dispatch',
      isError: true,
      content: [{ type: 'text' }],
    })
    expect((result as { content: Array<{ text: string }> }).content[0].text).toContain('JSON')
    expect(runtime.callTool).not.toHaveBeenCalled()
  })
})
