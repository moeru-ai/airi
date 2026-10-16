import { beforeEach, describe, expect, it, vi } from 'vitest'

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
      withFields: vi.fn(() => ({ debug: vi.fn(), warn: vi.fn() })),
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
  beforeEach(() => {
    vi.clearAllMocks()
    httpTransportMock.options = undefined
    httpTransportMock.url = undefined
    appMock.getPath.mockReturnValue('/tmp/airi-user-data')
    appMock.getVersion.mockReturnValue('0.10.0')
    clientMocks.close.mockResolvedValue(undefined)
    clientMocks.listTools.mockResolvedValue({ tools: [] })
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
