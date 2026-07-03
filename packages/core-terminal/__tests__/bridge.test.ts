/**
 * AIRI Core Terminal — Bridge unit tests
 *
 * We test the TerminalMcpBridge class's serialize/deserialize and error
 * normalization paths directly without spawning a subprocess. The actual
 * MCP SDK Client is mocked at the bridge boundary.
 */

import { describe, expect, it } from 'vitest'

import { resolveTerminalMcpOptions, TerminalMcpBridge } from '../src/bridge.js'

describe('terminalMcpBridge', () => {
  it('defaultBridgeOptions uses npx smart-terminal-mcp@stable', () => {
    const bridge = new TerminalMcpBridge()
    expect((bridge as any).options.command).toBe('npx')
    expect((bridge as any).options.args).toEqual(['-y', 'smart-terminal-mcp@stable'])
  })

  it('constructor accepts custom command/args', () => {
    const bridge = new TerminalMcpBridge({
      command: '/usr/bin/node',
      args: ['/path/to/server.js'],
    })
    expect((bridge as any).options.command).toBe('/usr/bin/node')
    expect((bridge as any).options.args).toEqual(['/path/to/server.js'])
  })

  it('callTool throws when called before connect', async () => {
    const bridge = new TerminalMcpBridge()
    await expect(bridge.callTool('terminal_run', { cmd: 'echo' })).rejects.toThrow('TerminalMcpBridge is not connected')
  })

  it('callTool captures MCP isError results as normalized errors', async () => {
    const bridge = new TerminalMcpBridge()
    // Replace the underlying client with a mock.
    const mockClient = {
      connect: () => Promise.resolve(undefined),
      listTools: () => Promise.resolve({ tools: [] }),
      callTool: () =>
        Promise.resolve({
          isError: true,
          content: [{ type: 'text', text: 'Something went wrong' }],
        }),
      close: () => Promise.resolve(undefined),
    }
    ;(bridge as any).client = mockClient
    ;(bridge as any).connected = true

    await expect(bridge.callTool('terminal_run', { cmd: 'bash' })).rejects.toMatchObject({
      code: 'MCP_TOOL_ERROR',
      message: 'Something went wrong',
    })
  })

  it('structuredContent is returned when present', async () => {
    const bridge = new TerminalMcpBridge()
    const mockClient = {
      callTool: () =>
        Promise.resolve({
          isError: false,
          structuredContent: { ok: true, stdout: 'hello' },
          content: [],
        }),
      close: () => Promise.resolve(undefined),
    }
    ;(bridge as any).client = mockClient
    ;(bridge as any).connected = true

    const result = await bridge.callTool('terminal_run', { cmd: 'echo', args: ['hello'] })
    expect(result).toEqual({ ok: true, stdout: 'hello' })
  })

  it('close is idempotent', async () => {
    const bridge = new TerminalMcpBridge()
    let closeCalls = 0
    const mockClient = {
      close: () => {
        closeCalls++
        return Promise.resolve(undefined)
      },
    }
    ;(bridge as any).client = mockClient
    ;(bridge as any).connected = true

    await bridge.close()
    await bridge.close()
    expect(closeCalls).toBe(1)
  })
})

describe('resolveTerminalMcpOptions', () => {
  it('returns empty options when env var is unset', () => {
    delete process.env.AIRI_TERMINAL_MCP_PATH
    expect(resolveTerminalMcpOptions()).toEqual({})
  })

  it('returns explicit node process config when env var is set', () => {
    process.env.AIRI_TERMINAL_MCP_PATH = '/home/vi/anima-use-terminal/src/index.js'
    expect(resolveTerminalMcpOptions()).toEqual({
      command: 'node',
      args: ['/home/vi/anima-use-terminal/src/index.js'],
    })
    delete process.env.AIRI_TERMINAL_MCP_PATH
  })
})
