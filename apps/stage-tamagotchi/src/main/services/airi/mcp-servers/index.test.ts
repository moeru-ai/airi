import { chmod, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const appMock = vi.hoisted(() => ({
  getPath: vi.fn(),
  getVersion: vi.fn(),
}))

const shellMock = vi.hoisted(() => ({
  showItemInFolder: vi.fn(),
}))

const clientMocks = vi.hoisted(() => ({
  callTool: vi.fn(),
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
    callTool = clientMocks.callTool
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

async function createTempUserDataDir() {
  const userDataDir = await mkdtemp(join(tmpdir(), 'airi-mcp-'))
  appMock.getPath.mockReturnValue(userDataDir)
  return userDataDir
}

describe('createMcpStdioManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appMock.getPath.mockReturnValue('/tmp/airi-user-data')
    appMock.getVersion.mockReturnValue('0.10.0')
    clientMocks.callTool.mockReset()
    clientMocks.close.mockResolvedValue(undefined)
    clientMocks.listTools.mockResolvedValue({ tools: [] })
  })

  it('includes stderr captured during connect failures in MCP server test results', async () => {
    const { createMcpStdioManager } = await import('./index')
    const manager = createMcpStdioManager()

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

  // NOTICE:
  // Windows does not implement POSIX file modes, so this check runs on the
  // Linux and macOS runners that enforce file permissions.
  it.skipIf(process.platform === 'win32')('writes mcp.json with owner-only permissions', async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), 'airi-mcp-'))
    appMock.getPath.mockReturnValue(userDataDir)

    try {
      const { createMcpStdioManager } = await import('./index')
      const manager = createMcpStdioManager()

      await manager.writeConfigText(JSON.stringify({ mcpServers: {} }))

      const fileStats = await stat(join(userDataDir, 'mcp.json'))
      expect(fileStats.mode & 0o777).toBe(0o600)
    }
    finally {
      await rm(userDataDir, { recursive: true, force: true })
    }
  })

  it.skipIf(process.platform === 'win32')('tightens permissions on an existing mcp.json', async () => {
    const userDataDir = await createTempUserDataDir()

    try {
      const path = join(userDataDir, 'mcp.json')
      await writeFile(path, JSON.stringify({ mcpServers: {} }), { mode: 0o644 })
      await chmod(path, 0o644)
      const { createMcpStdioManager } = await import('./index')
      const manager = createMcpStdioManager()

      await manager.ensureConfigFile()

      const fileStats = await stat(path)
      expect(fileStats.mode & 0o777).toBe(0o600)
    }
    finally {
      await rm(userDataDir, { recursive: true, force: true })
    }
  })

  it('caps MCP tool lists and descriptions', async () => {
    const userDataDir = await createTempUserDataDir()

    try {
      clientMocks.listTools.mockResolvedValue({
        tools: Array.from({ length: 250 }, (_, index) => ({
          name: `tool-${index}`,
          description: 'x'.repeat(5_000),
          inputSchema: { type: 'object' },
        })),
      })
      const { createMcpStdioManager } = await import('./index')
      const manager = createMcpStdioManager()
      await manager.writeConfigText(JSON.stringify({ mcpServers: { srv: { command: 'srv' } } }))
      await manager.applyAndRestart()

      const tools = await manager.listTools()

      expect(tools).toHaveLength(200)
      expect(tools[0]?.description ?? '').toContain('truncated by AIRI')
    }
    finally {
      await rm(userDataDir, { recursive: true, force: true })
    }
  })

  it('skips MCP tools with oversized descriptors', async () => {
    const userDataDir = await createTempUserDataDir()

    try {
      clientMocks.listTools.mockResolvedValue({
        tools: [
          { name: 'normal-tool', description: 'ok', inputSchema: { type: 'object' } },
          {
            name: 'huge-schema-tool',
            description: 'ok',
            inputSchema: {
              type: 'object',
              properties: {
                data: { description: 'x'.repeat(80_000) },
              },
            },
          },
        ],
      })
      const { createMcpStdioManager } = await import('./index')
      const manager = createMcpStdioManager()
      await manager.writeConfigText(JSON.stringify({ mcpServers: { srv: { command: 'srv' } } }))
      await manager.applyAndRestart()

      const tools = await manager.listTools()

      expect(tools.map(tool => tool.toolName)).toEqual(['normal-tool'])
    }
    finally {
      await rm(userDataDir, { recursive: true, force: true })
    }
  })

  it('caps oversized MCP tool results', async () => {
    const userDataDir = await createTempUserDataDir()

    try {
      clientMocks.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'x'.repeat(300_000) }],
      })
      const { createMcpStdioManager } = await import('./index')
      const manager = createMcpStdioManager()
      await manager.writeConfigText(JSON.stringify({ mcpServers: { srv: { command: 'srv' } } }))
      await manager.applyAndRestart()

      const result = await manager.callTool({ name: 'srv::tool' })
      const text = result.content?.[0]?.text as string | undefined

      expect(text ?? '').toContain('truncated by AIRI')
      expect((text ?? '').length).toBeLessThan(300_000)
    }
    finally {
      await rm(userDataDir, { recursive: true, force: true })
    }
  })

  it('drops oversized text block metadata from MCP tool results', async () => {
    const userDataDir = await createTempUserDataDir()

    try {
      clientMocks.callTool.mockResolvedValue({
        content: [{
          type: 'text',
          text: 'small',
          _meta: { padding: 'x'.repeat(300_000) },
        }],
      })
      const { createMcpStdioManager } = await import('./index')
      const manager = createMcpStdioManager()
      await manager.writeConfigText(JSON.stringify({ mcpServers: { srv: { command: 'srv' } } }))
      await manager.applyAndRestart()

      const result = await manager.callTool({ name: 'srv::tool' })

      // Optional block fields are dropped, and the whole result stays bounded.
      expect(result.content?.[0]?.text).toBe('small')
      expect(result.content?.[0]?._meta).toBeUndefined()
      expect((JSON.stringify(result.content) ?? '').length).toBeLessThan(1_000)
    }
    finally {
      await rm(userDataDir, { recursive: true, force: true })
    }
  })
})
