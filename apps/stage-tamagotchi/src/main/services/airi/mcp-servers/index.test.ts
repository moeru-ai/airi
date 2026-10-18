import type { ElectronMainContextExtensions, ElectronMainEmitOptions } from '@moeru/eventa/adapters/electron/main'

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createContext, defineInvoke } from '@moeru/eventa'
import { createMcpTools } from '@proj-airi/stage-ui/tools/mcp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { electronMcpCallTool, electronMcpListTools } from '../../../../shared/eventa'
import { createMcpManager, createMcpServersService } from './index'

const appMock = vi.hoisted(() => ({
  getPath: vi.fn(),
  getVersion: vi.fn(),
}))

const shellMock = vi.hoisted(() => ({
  showItemInFolder: vi.fn(),
}))

const clientMocks = vi.hoisted(() => ({
  close: vi.fn(),
  connect: vi.fn(),
  listTools: vi.fn(),
}))

vi.mock('electron', () => ({
  app: appMock,
  shell: shellMock,
}))

vi.mock('@guiiai/logg', () => ({
  useLogg: vi.fn(() => ({
    useGlobalConfig: () => ({
      debug: vi.fn(),
      warn: vi.fn(),
      withError: vi.fn(() => ({ warn: vi.fn() })),
      withFields: vi.fn(() => ({ debug: vi.fn(), warn: vi.fn(), withError: vi.fn(() => ({ warn: vi.fn() })) })),
    }),
  })),
}))

vi.mock('../../../libs/bootkit/lifecycle', () => ({
  onAppBeforeQuit: vi.fn(),
}))

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    close = clientMocks.close
    connect = clientMocks.connect
    listTools = clientMocks.listTools
  },
}))

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', async () => {
  const { PassThrough } = await import('node:stream')

  return {
    StdioClientTransport: class {
      stderr = new PassThrough()

      constructor(readonly server: unknown) {}

      close = vi.fn(async () => undefined)
    },
  }
})

const httpTransportMock = vi.hoisted(() => ({
  options: undefined as unknown,
  url: undefined as URL | undefined,
}))

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class {
    constructor(url: URL, options?: unknown) {
      httpTransportMock.url = url
      httpTransportMock.options = options
    }

    close = vi.fn(async () => undefined)
  },
}))

describe('createMcpManager', () => {
  let userDataPath: string
  const managers: ReturnType<typeof createMcpManager>[] = []

  beforeEach(async () => {
    vi.clearAllMocks()
    httpTransportMock.options = undefined
    httpTransportMock.url = undefined
    userDataPath = await mkdtemp(join(tmpdir(), 'airi-mcp-discovery-'))
    appMock.getPath.mockReturnValue(userDataPath)
    appMock.getVersion.mockReturnValue('0.10.0')
    clientMocks.close.mockResolvedValue(undefined)
    clientMocks.connect.mockResolvedValue(undefined)
    clientMocks.listTools.mockResolvedValue({ tools: [] })
  })

  afterEach(async () => {
    for (const manager of managers.splice(0))
      await manager.stopAll()
    await rm(userDataPath, { recursive: true, force: true })
  })

  async function startServers(...serverNames: string[]) {
    await writeFile(join(userDataPath, 'mcp.json'), JSON.stringify({
      mcpServers: Object.fromEntries(serverNames.map(name => [name, { command: 'test-mcp-server' }])),
    }))
    const manager = createMcpManager()
    managers.push(manager)
    expect((await manager.applyAndRestart()).failed).toEqual([])
    return manager
  }

  // https://github.com/moeru-ai/airi/pull/2946#discussion_r4254219145
  // ROOT CAUSE:
  //
  // The manager caught disconnected and timed-out requests and returned an empty array.
  // We fixed this by rejecting discovery with the server name and failure reason.
  it.each([
    ['disconnect', 'MCP connection closed.'],
    ['timeout', 'MCP request timed out.'],
  ])('reports %s discovery failures with the server name (Issue #2779)', async (_scenario, message) => {
    const manager = await startServers('memory')
    clientMocks.listTools.mockRejectedValueOnce(new Error(message))

    await expect(manager.listTools()).rejects.toThrow(`MCP server "memory": ${message}`)
  })

  // https://github.com/moeru-ai/airi/pull/2946#discussion_r4254219145
  // ROOT CAUSE:
  //
  // A mixed result silently omitted failed servers and returned an incomplete catalog.
  // We fixed this by collecting every result and rejecting with all failure reasons.
  it('reports every failed server in a mixed discovery result (Issue #2779)', async () => {
    const manager = await startServers('gamma', 'beta', 'alpha')
    clientMocks.listTools
      .mockRejectedValueOnce(new Error('Connection closed.'))
      .mockResolvedValueOnce({ tools: [{ name: 'search', inputSchema: { type: 'object' } }] })
      .mockRejectedValueOnce(new Error('Request timed out.'))

    const result = manager.listTools()

    await expect(result).rejects.toBeInstanceOf(AggregateError)
    await expect(result).rejects.toThrow('MCP server "alpha": Connection closed.')
    await expect(result).rejects.toThrow('MCP server "gamma": Request timed out.')
    expect(clientMocks.listTools).toHaveBeenCalledTimes(3)
  })

  // https://github.com/moeru-ai/airi/pull/2946#discussion_r4254219145
  // ROOT CAUSE:
  //
  // The production manager hid the error before the Eventa handler and model tool received it.
  // We fixed this by propagating discovery errors through the existing invoke contract.
  it('passes production discovery failures to the model as an error result (Issue #2779)', async () => {
    const manager = await startServers('memory')
    clientMocks.listTools.mockRejectedValueOnce(new Error('MCP request timed out.'))
    const context = createContext<ElectronMainContextExtensions, ElectronMainEmitOptions>()
    createMcpServersService({ context, manager })
    const listMcpTools = defineInvoke(context, electronMcpListTools)
    const callMcpTool = defineInvoke(context, electronMcpCallTool)
    const [listTools] = await Promise.all(createMcpTools({
      listTools: () => listMcpTools(),
      callTool: payload => callMcpTool(payload),
    }))

    const result = await listTools.execute({}, { messages: [], toolCallId: 'failed-discovery' })

    expect(result).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'MCP tool discovery failed: MCP server "memory": MCP request timed out.' }],
    })
  })

  it('returns an empty catalog when no server runs', async () => {
    const manager = await startServers()

    expect(await manager.listTools()).toEqual([])
    expect(clientMocks.listTools).not.toHaveBeenCalled()
  })

  it('treats successful discovery with no tools as an empty catalog', async () => {
    const manager = await startServers('memory')

    expect(await manager.listTools()).toEqual([])
    expect(clientMocks.listTools).toHaveBeenCalledWith(undefined, { timeout: 10_000, maxTotalTimeout: 15_000 })
  })

  it('returns every descriptor in server name order when all queries succeed', async () => {
    const manager = await startServers('zeta', 'alpha')
    clientMocks.listTools
      .mockResolvedValueOnce({ tools: [{ name: 'read', description: 'Read memory.', inputSchema: { type: 'object' } }] })
      .mockResolvedValueOnce({ tools: [{ name: 'search', description: 'Search files.', inputSchema: { type: 'object' } }] })

    expect(await manager.listTools()).toEqual([
      { serverName: 'alpha', name: 'alpha::read', toolName: 'read', description: 'Read memory.', inputSchema: { type: 'object' } },
      { serverName: 'zeta', name: 'zeta::search', toolName: 'search', description: 'Search files.', inputSchema: { type: 'object' } },
    ])
  })

  it('includes stderr captured during connect failures in MCP server test results', async () => {
    const { createMcpManager } = await import('./index')
    const manager = createMcpManager()

    clientMocks.connect.mockImplementationOnce(async (transport: { stderr: NodeJS.WritableStream }) => {
      transport.stderr.write('Missing required environment variable: API_KEY\n')
      throw new Error('connect failed')
    })

    const result = await manager.testServer({
      name: 'broken-server',
      config: {
        command: 'broken-mcp-server',
      },
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('connect failed')
    expect(result.error).toContain('Missing required environment variable: API_KEY')
  })

  it('reaches a remote server over streamable HTTP and sends its headers', async () => {
    const { createMcpManager } = await import('./index')
    const manager = createMcpManager()

    clientMocks.connect.mockResolvedValueOnce(undefined)
    clientMocks.listTools.mockResolvedValueOnce({ tools: [{ name: 'search_docs' }] })

    const result = await manager.testServer({
      name: 'remote-server',
      config: {
        url: 'https://mcp.example.com/mcp',
        headers: { Authorization: 'Bearer token' },
      },
    })

    expect(result.ok).toBe(true)
    expect(result.tools).toEqual(['search_docs'])
    expect(httpTransportMock.url?.toString()).toBe('https://mcp.example.com/mcp')
    expect(httpTransportMock.options).toEqual({ requestInit: { headers: { Authorization: 'Bearer token' } } })
  })
})
