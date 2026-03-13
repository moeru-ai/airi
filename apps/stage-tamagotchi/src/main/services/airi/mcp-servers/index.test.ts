import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMcpStdioManager } from './index'

const appMock = vi.hoisted(() => ({
  getPath: vi.fn(),
  getVersion: vi.fn(),
}))

const shellMock = vi.hoisted(() => ({
  openPath: vi.fn(),
}))

const loggerMock = vi.hoisted(() => {
  const chain = {
    log: vi.fn(),
    warn: vi.fn(),
    withError: vi.fn(() => chain),
    withFields: vi.fn(() => chain),
  }

  return {
    chain,
    useLogg: vi.fn(() => ({
      useGlobalConfig: () => chain,
    })),
  }
})

const mcpMockState = vi.hoisted(() => ({
  callToolCalls: [] as Array<{
    serverName: string
    toolName: string
    arguments: Record<string, unknown>
    options?: Record<string, unknown>
  }>,
  toolsByServer: {} as Record<string, string[]>,
}))

vi.mock('electron', () => ({
  app: appMock,
  shell: shellMock,
}))

vi.mock('@guiiai/logg', () => ({
  useLogg: loggerMock.useLogg,
}))

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class MockStdioClientTransport {
    pid = 4242
    stderr = {
      on: vi.fn(),
    }

    constructor(_: unknown) {}

    async close() {}
  },
}))

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class MockClient {
    private readonly serverName: string

    constructor(config: { name: string }) {
      this.serverName = config.name.split(':').pop() || 'unknown'
    }

    async connect(_: unknown) {}

    async close() {}

    async listTools() {
      return {
        tools: (mcpMockState.toolsByServer[this.serverName] || []).map(toolName => ({
          name: toolName,
          description: `${toolName} description`,
          inputSchema: { type: 'object' },
        })),
      }
    }

    async callTool(payload: { name: string, arguments?: Record<string, unknown> }, _: unknown, options?: Record<string, unknown>) {
      mcpMockState.callToolCalls.push({
        serverName: this.serverName,
        toolName: payload.name,
        arguments: payload.arguments || {},
        options,
      })

      return {
        content: [{ type: 'text', text: `${this.serverName}:${payload.name}` }],
      }
    }
  },
}))

describe('createMcpStdioManager', () => {
  let userDataDir: string

  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), 'airi-mcp-stdio-'))
    appMock.getPath.mockImplementation((name: string) => {
      if (name === 'userData') {
        return userDataDir
      }

      throw new Error(`unexpected app path request: ${name}`)
    })
    appMock.getVersion.mockReturnValue('0.0.0-test')
    shellMock.openPath.mockResolvedValue('')
    mcpMockState.callToolCalls = []
    mcpMockState.toolsByServer = {
      auxiliary_tools: ['get_status'],
      computer_use: ['terminal_exec'],
    }

    await writeFile(join(userDataDir, 'mcp.json'), JSON.stringify({
      mcpServers: {
        computer_use: {
          command: 'pnpm',
          args: ['-F', '@proj-airi/computer-use-mcp', 'start'],
        },
        auxiliary_tools: {
          command: 'pnpm',
          args: ['-F', '@proj-airi/computer-use-mcp', 'start'],
        },
      },
    }, null, 2))
  })

  afterEach(async () => {
    await rm(userDataDir, { recursive: true, force: true })
    vi.clearAllMocks()
    mcpMockState.callToolCalls = []
    mcpMockState.toolsByServer = {}
  })

  it('routes hallucinated functions namespace to the unique running MCP server that owns the tool', async () => {
    const manager = createMcpStdioManager()

    await manager.applyAndRestart()

    const result = await manager.callTool({
      name: 'functions::terminal_exec',
      arguments: {
        command: 'echo hello',
      },
    })

    expect(mcpMockState.callToolCalls).toEqual([
      {
        serverName: 'computer_use',
        toolName: 'terminal_exec',
        arguments: {
          command: 'echo hello',
        },
        options: {
          timeout: 60_000,
          maxTotalTimeout: 180_000,
        },
      },
    ])
    expect(result.structuredContent).toEqual(expect.objectContaining({
      requestedServerName: 'functions',
      resolvedServerName: 'computer_use',
      toolName: 'terminal_exec',
    }))
    expect(result).toEqual(expect.objectContaining({
      requestedServerName: 'functions',
      resolvedServerName: 'computer_use',
      resolvedToolName: 'terminal_exec',
    }))
  })

  it('fails clearly when fallback tool-name routing is ambiguous', async () => {
    mcpMockState.toolsByServer = {
      auxiliary_tools: ['shared_tool'],
      computer_use: ['shared_tool'],
    }

    const manager = createMcpStdioManager()

    await manager.applyAndRestart()

    await expect(manager.callTool({
      name: 'functions::shared_tool',
      arguments: {},
    })).rejects.toThrow('tool "shared_tool" exists on multiple running servers: auxiliary_tools, computer_use')
  })
})
