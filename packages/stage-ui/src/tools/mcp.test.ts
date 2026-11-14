import type { JsonSchema } from 'xsschema'

import type { McpToolRuntime } from './mcp'

import { describe, expect, it, vi } from 'vitest'

import { createMcpTools, mcp } from './mcp'

function createRuntime(): McpToolRuntime {
  return {
    listTools: vi.fn(async () => []),
    callTool: vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] })),
  }
}

describe('tools mcp schema', () => {
  it('emits strict parameter objects', async () => {
    const tools = await createMcpTools(createRuntime())
    for (const name of ['builtIn_mcpListTools', 'builtIn_mcpCallTool']) {
      const t = tools.find(entry => entry.function.name === name)
      expect(t, `missing tool: ${name}`).toBeDefined()
      expect(t?.function.parameters.additionalProperties).toBe(false)
    }
  })

  it('builtIn_mcpCallTool uses flat name+arguments schema', async () => {
    const tools = await createMcpTools(createRuntime())
    const callTool = tools.find(entry => entry.function.name === 'builtIn_mcpCallTool')
    expect(callTool).toBeDefined()

    const props = (callTool!.function.parameters as JsonSchema).properties!
    expect((props.name as JsonSchema).type).toBe('string')
    expect((props.arguments as JsonSchema).type).toBe('string')
  })

  it('describes optional Terminal routing and Host-gated AUV use', async () => {
    const [listTools] = await createMcpTools(createRuntime())
    expect(listTools.function.description).toContain('do not call Terminal as a preflight')
    expect(listTools.function.description).toContain('Reserve AUV for on-screen visual state or GUI interaction when the Host permits it')
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
    const tools = await createMcpTools(runtime, { direct: descriptors })
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
    const [list] = await createMcpTools(runtime)
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
    const [list, , terminal] = await createMcpTools(runtime, { direct })
    expect(await list.validate!({ name: null })).toEqual({ value: { name: null } })
    expect(await list.execute({ name: null }, { messages: [], toolCallId: 'catalog' })).toEqual(await runtime.listTools())
    expect(await terminal.execute({}, { messages: [], toolCallId: 'once' })).toMatchObject({ isError: true, content: [{ text: 'Effect occurred, response lost.' }] })
    expect(runtime.callTool).toHaveBeenCalledOnce()
    expect(effects).toBe(1)
  })

  it('registers direct and discovery tools without starting the catalog request', async () => {
    const runtime = createRuntime()
    vi.mocked(runtime.listTools).mockReturnValue(new Promise(() => {}))
    const direct = [{ serverName: 'fixture', name: 'fixture::terminal_exec', toolName: 'terminal_exec', exposure: 'direct', inputSchema: { type: 'object', properties: {} } }] as const

    const tools = await createMcpTools(runtime, { direct })

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

    const [listTools] = await createMcpTools(runtime, { servers: ['fixture'] })

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
    const [listTools] = await createMcpTools(runtime)

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
    const [listTools] = await createMcpTools(runtime)

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
    const [listTools, callTool] = await createMcpTools(runtime)

    expect(await listTools.execute({}, { messages: [], toolCallId: 'list-success' })).toEqual(descriptors)
    expect(await callTool.execute({ name: 'memory::read_graph', arguments: '{}' }, { messages: [], toolCallId: 'call-success' }))
      .toEqual({ content: [{ type: 'text', text: 'ok' }] })
    expect(runtime.callTool).toHaveBeenCalledWith({ name: 'memory::read_graph', arguments: {} }, expect.objectContaining({ toolCallId: 'call-success' }))
  })

  it('retains invocation failures as MCP error results', async () => {
    const runtime = createRuntime()
    vi.mocked(runtime.listTools).mockResolvedValue([{ serverName: 'memory', name: 'memory::missing', toolName: 'missing', inputSchema: { type: 'object', properties: {} } }])
    vi.mocked(runtime.callTool).mockRejectedValue(new Error('Unknown tool.'))
    const [, callTool] = await createMcpTools(runtime)

    const result = await callTool.execute({ name: 'memory::missing', arguments: '{}' }, { messages: [], toolCallId: 'call-failed' })

    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: 'Unknown tool.' }] })
  })
})
