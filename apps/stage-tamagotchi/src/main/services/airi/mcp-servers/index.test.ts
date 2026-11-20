import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { ElectronMainContextExtensions, ElectronMainEmitOptions } from '@moeru/eventa/adapters/electron/main'

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createContext, defineInvoke } from '@moeru/eventa'
import { resolveLlmTools } from '@proj-airi/stage-ui/stores/ai/chat-llm/tool-resolver'
import { createMcpTools } from '@proj-airi/stage-ui/tools/mcp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { electronMcpCallTool, electronMcpListTools } from '../../../../shared/eventa'
import { PendingActionManager } from '../computer-use/action-manager'
import { createMcpManager, createMcpServersService } from './index'

const appMock = vi.hoisted(() => ({
  isPackaged: false,
  getAppPath: vi.fn(),
  getPath: vi.fn(),
  getVersion: vi.fn(),
}))

const shellMock = vi.hoisted(() => ({
  showItemInFolder: vi.fn(),
}))

const clientMocks = vi.hoisted(() => ({
  instances: [] as Array<Pick<Client, 'onclose' | 'onerror'>>,
  callTool: vi.fn<Client['callTool']>(),
  privateRequest: vi.fn(),
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
      withFields: vi.fn(() => ({ debug: vi.fn(), log: vi.fn(), warn: vi.fn(), withError: vi.fn(() => ({ warn: vi.fn() })) })),
    }),
  })),
}))

vi.mock('../../../libs/bootkit/lifecycle', () => ({
  onAppBeforeQuit: vi.fn(),
}))

vi.mock('@modelcontextprotocol/sdk/client/index.js', async (importOriginal) => {
  const { Client } = await importOriginal<typeof import('@modelcontextprotocol/sdk/client/index.js')>()
  return {
    Client: class extends Client {
      constructor(...args: ConstructorParameters<typeof Client>) {
        super(...args)
        clientMocks.instances.push(this)
      }

      callTool = clientMocks.callTool
      close = clientMocks.close
      connect = clientMocks.connect

      override async request(...[request, schema, options]: Parameters<Client['request']>) {
        if (request.method === 'tools/list')
          return clientMocks.listTools.call(this, request.params, options)
        return clientMocks.privateRequest.call(this, request, schema, options)
      }
    },
  }
})

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', async () => {
  const { PassThrough } = await import('node:stream')

  return {
    StdioClientTransport: class {
      stderr = new PassThrough()
      pid = 101

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
    clientMocks.instances.length = 0
    appMock.isPackaged = false
    httpTransportMock.options = undefined
    httpTransportMock.url = undefined
    userDataPath = await mkdtemp(join(tmpdir(), 'airi-mcp-discovery-'))
    appMock.getPath.mockReturnValue(userDataPath)
    appMock.getAppPath.mockReturnValue(join(userDataPath, 'app'))
    appMock.getVersion.mockReturnValue('0.10.0')
    clientMocks.close.mockResolvedValue(undefined)
    clientMocks.connect.mockResolvedValue(undefined)
    clientMocks.listTools.mockResolvedValue({ tools: [] })
    clientMocks.callTool.mockReset()
    clientMocks.privateRequest.mockReset()
  })

  afterEach(async () => {
    for (const manager of managers.splice(0))
      await manager.stopAll()
    await rm(userDataPath, { recursive: true, force: true })
    vi.unstubAllEnvs()
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

  it('returns the completed Turbo result inside the same Terminal tool call', async () => {
    const actions = new PendingActionManager()
    const attribution = { sessionId: 'session-a', turnId: 'turn-a', toolCallId: 'call-a' }
    const request = actions.registerRequest({ sessionId: attribution.sessionId, turnId: attribution.turnId, text: 'Read the requested fixture.' }, 71)
    actions.setTerminalTurbo(attribution.sessionId, 71, true)
    const notify = vi.fn(async notice => ({ status: 'stored' as const, sessionId: notice.sessionId, messageId: `terminal:${notice.actionId}` }))
    const manager = createMcpManager({
      actions,
      present: vi.fn(async () => false),
      presentComputerUse: vi.fn(async () => false),
      executeInSlot: operation => operation(new AbortController().signal, () => {}),
      notify,
    })
    managers.push(manager)
    await manager.writeConfigText(JSON.stringify({ terminalEnabled: true, mcpServers: {} }))
    await manager.applyAndRestart()
    clientMocks.listTools.mockResolvedValue({ tools: [{ name: 'terminal_exec', inputSchema: { type: 'object' } }] })
    const makeSnapshot = (preparedId: string, toolCallId: string, command: string) => ({
      protocol: 'airi-terminal-approval/1',
      preparedId,
      requestId: request.id,
      toolCallId,
      command,
      shell: 'fixture-shell',
      argv: ['--command', command],
      effectiveCwd: '/fixture',
      cwdSource: 'runner-state',
      timeoutMs: 1_000,
      executorPid: 101,
      executorPlatform: 'fixture',
      executorCwd: '/fixture',
      detached: false,
      windowsHide: true,
    })
    const firstSnapshot = makeSnapshot('prepared-a', attribution.toolCallId, 'Write-Output completed')
    const secondAttribution = { ...attribution, toolCallId: 'call-b' }
    const secondSnapshot = makeSnapshot('prepared-b', secondAttribution.toolCallId, 'Write-Output next')
    clientMocks.callTool
      .mockResolvedValueOnce({ content: [], structuredContent: { status: 'approval_required', preparedTerminal: firstSnapshot } })
      .mockResolvedValueOnce({ content: [], structuredContent: { status: 'approval_required', preparedTerminal: secondSnapshot } })
    const requestStarted = Promise.withResolvers<void>()
    const releaseExecution = Promise.withResolvers<void>()
    let executionCount = 0
    clientMocks.privateRequest.mockImplementation(async () => {
      executionCount++
      if (executionCount === 1) {
        requestStarted.resolve()
        await releaseExecution.promise
      }
      return { content: [{ type: 'text', text: `fixture command ${executionCount} completed` }], structuredContent: { terminalLifecycle: 'closed', backendResult: { exitCode: 0, timedOut: false } } }
    })

    let callSettled = false
    const pending = manager.callTool({
      name: 'airi-terminal::terminal_exec',
      arguments: { command: firstSnapshot.command },
      requestId: request.id,
      attribution,
    }, 71).then((result) => {
      callSettled = true
      return result
    })
    await requestStarted.promise
    await Promise.resolve()

    expect(callSettled).toBe(false)
    expect(clientMocks.privateRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'airi/terminal/execute-prepared' }),
      expect.anything(),
      expect.objectContaining({ timeout: 31_000, maxTotalTimeout: 31_000 }),
    )

    releaseExecution.resolve()
    const result = await pending

    expect(result.structuredContent).toMatchObject({ status: 'executed', approval: 'turbo' })
    expect(result.content?.[0]?.text).toContain('fixture command 1 completed')
    expect(result.content?.[0]?.text).not.toContain('Exit code zero confirms Shell completion')
    expect(result.content?.[0]?.text).not.toContain('executionTarget')
    expect(actions.get(String(result.structuredContent?.hostActionId))?.settlement).toMatchObject({ outcome: 'success', exitCode: 0 })

    const next = await manager.callTool({
      name: 'airi-terminal::terminal_exec',
      arguments: { command: secondSnapshot.command },
      requestId: request.id,
      attribution: secondAttribution,
    }, 71)

    expect(next.structuredContent).toMatchObject({ status: 'executed', approval: 'turbo' })
    expect(next.content?.[0]?.text).toContain('fixture command 2 completed')
    expect(clientMocks.privateRequest).toHaveBeenCalledTimes(2)
    expect(notify).not.toHaveBeenCalled()
  })

  it('routes a Computer Use mutation through the shared Host approval dialog', async () => {
    const actions = new PendingActionManager()
    const attribution = { sessionId: 'session-computer', turnId: 'turn-computer', toolCallId: 'call-computer' }
    const request = actions.registerRequest({ sessionId: attribution.sessionId, turnId: attribution.turnId, text: 'Change the desktop.' }, 71)
    const presentComputerUse = vi.fn(async () => true)
    const manager = createMcpManager({
      actions,
      present: vi.fn(async () => false),
      presentComputerUse,
      executeInSlot: async operation => operation(new AbortController().signal, () => {}),
      notify: async notice => ({ status: 'stored', sessionId: notice.sessionId, messageId: 'fixture' }),
    })
    managers.push(manager)
    await manager.writeConfigText(JSON.stringify({ terminalEnabled: true, mcpServers: {} }))
    await manager.applyAndRestart()
    clientMocks.listTools.mockResolvedValue({ tools: [{ name: 'computer_act', inputSchema: { type: 'object' } }] })
    expect((await manager.listTools()).find(tool => tool.toolName === 'computer_act')?.exposure).toBe('direct')
    clientMocks.callTool.mockResolvedValue({
      content: [{ type: 'text', text: 'Approval required.' }],
      structuredContent: { status: 'approval_required', pendingActionId: 'pending-computer', toolName: 'computer_act', action: { kind: 'click', input: { x: 10, y: 20 } }, transparency: { intent: 'Click the requested point.' } },
    })
    clientMocks.privateRequest.mockResolvedValue({ content: [{ type: 'text', text: 'Clicked.' }], structuredContent: { status: 'executed', action: 'click' } })

    const result = await manager.callTool({ name: 'airi-terminal::computer_act', arguments: { x: 10, y: 20 }, requestId: request.id, attribution }, 71)

    expect(presentComputerUse).toHaveBeenCalledWith(expect.objectContaining({ actionId: 'pending-computer', requestId: request.id, toolName: 'computer_act', summary: 'Click the requested point.' }), expect.anything())
    expect(clientMocks.privateRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'airi/computer-use/execute-prepared' }), expect.anything(), expect.objectContaining({ timeout: 15_000, maxTotalTimeout: 15_000 }))
    expect(result.structuredContent).toMatchObject({ status: 'executed', action: 'click' })
  })

  it('still requires Computer Use approval when only Terminal Turbo is active', async () => {
    const actions = new PendingActionManager()
    const attribution = { sessionId: 'session-terminal-only-turbo', turnId: 'turn-terminal-only-turbo', toolCallId: 'call-terminal-only-turbo' }
    const request = actions.registerRequest({ sessionId: attribution.sessionId, turnId: attribution.turnId, text: 'Change the desktop.' }, 71)
    actions.setTerminalTurbo(attribution.sessionId, 71, true)
    const presentComputerUse = vi.fn(async () => true)
    const manager = createMcpManager({
      actions,
      present: vi.fn(async () => false),
      presentComputerUse,
      executeInSlot: async operation => operation(new AbortController().signal, () => {}),
      notify: async notice => ({ status: 'stored', sessionId: notice.sessionId, messageId: 'fixture' }),
    })
    managers.push(manager)
    await manager.writeConfigText(JSON.stringify({ terminalEnabled: true, mcpServers: {} }))
    await manager.applyAndRestart()
    clientMocks.listTools.mockResolvedValue({ tools: [{ name: 'computer_act', inputSchema: { type: 'object' } }] })
    clientMocks.callTool.mockResolvedValue({ content: [], structuredContent: { status: 'approval_required', pendingActionId: 'pending-terminal-only', toolName: 'computer_act', action: { kind: 'click', input: { x: 10, y: 20 } } } })
    clientMocks.privateRequest.mockResolvedValue({ content: [{ type: 'text', text: 'Clicked.' }], structuredContent: { status: 'executed', action: 'click' } })

    await manager.callTool({ name: 'airi-terminal::computer_act', arguments: { x: 10, y: 20 }, requestId: request.id, attribution }, 71)

    expect(presentComputerUse).toHaveBeenCalledOnce()
    expect(actions.computerUseTurboSignal(attribution.sessionId, 71)).toBeUndefined()
  })

  it('skips the Computer Use approval dialog while Computer Use Turbo is active', async () => {
    const actions = new PendingActionManager()
    const attribution = { sessionId: 'session-turbo-computer', turnId: 'turn-turbo-computer', toolCallId: 'call-turbo-computer' }
    const request = actions.registerRequest({ sessionId: attribution.sessionId, turnId: attribution.turnId, text: 'Change the desktop.' }, 71)
    actions.setComputerUseTurbo(attribution.sessionId, 71, true)
    const presentComputerUse = vi.fn(async () => false)
    const manager = createMcpManager({
      actions,
      present: vi.fn(async () => false),
      presentComputerUse,
      executeInSlot: async operation => operation(new AbortController().signal, () => {}),
      notify: async notice => ({ status: 'stored', sessionId: notice.sessionId, messageId: 'fixture' }),
    })
    managers.push(manager)
    await manager.writeConfigText(JSON.stringify({ terminalEnabled: true, mcpServers: {} }))
    await manager.applyAndRestart()
    clientMocks.listTools.mockResolvedValue({ tools: [{ name: 'computer_act', inputSchema: { type: 'object' } }] })
    clientMocks.callTool.mockResolvedValue({ content: [], structuredContent: { status: 'approval_required', pendingActionId: 'pending-turbo-computer', toolName: 'computer_act', action: { kind: 'click', input: { x: 10, y: 20 } } } })
    clientMocks.privateRequest.mockResolvedValue({ content: [{ type: 'text', text: 'Clicked.' }], structuredContent: { status: 'executed', action: 'click' } })

    const result = await manager.callTool({ name: 'airi-terminal::computer_act', arguments: { x: 10, y: 20 }, requestId: request.id, attribution }, 71)

    expect(presentComputerUse).not.toHaveBeenCalled()
    expect(clientMocks.privateRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'airi/computer-use/execute-prepared' }), expect.anything(), expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(result.structuredContent).toMatchObject({ status: 'executed', action: 'click' })
  })

  it('cancels a queued Computer Use dispatch when Turbo is turned off', async () => {
    const actions = new PendingActionManager()
    const attribution = { sessionId: 'session-revoked-turbo', turnId: 'turn-revoked-turbo', toolCallId: 'call-revoked-turbo' }
    const request = actions.registerRequest({ sessionId: attribution.sessionId, turnId: attribution.turnId, text: 'Change the desktop.' }, 71)
    actions.setComputerUseTurbo(attribution.sessionId, 71, true)
    const presentComputerUse = vi.fn(async () => false)
    const manager = createMcpManager({
      actions,
      present: vi.fn(async () => false),
      presentComputerUse,
      executeInSlot: async operation => operation(new AbortController().signal, () => {}),
      notify: async notice => ({ status: 'stored', sessionId: notice.sessionId, messageId: 'fixture' }),
    })
    managers.push(manager)
    await manager.writeConfigText(JSON.stringify({ terminalEnabled: true, mcpServers: {} }))
    await manager.applyAndRestart()
    clientMocks.listTools.mockResolvedValue({ tools: [{ name: 'computer_act', inputSchema: { type: 'object' } }] })
    clientMocks.callTool.mockResolvedValue({ content: [], structuredContent: { status: 'approval_required', pendingActionId: 'pending-revoked-turbo', toolName: 'computer_act', action: { kind: 'click', input: { x: 10, y: 20 } } } })
    const executionStarted = Promise.withResolvers<AbortSignal>()
    clientMocks.privateRequest.mockImplementation(async (_request, _schema, options) => {
      const signal = options?.signal
      if (!signal)
        throw new Error('Computer Use Turbo execution must carry its revocation signal.')
      executionStarted.resolve(signal)
      return await new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    })

    const pending = manager.callTool({ name: 'airi-terminal::computer_act', arguments: { x: 10, y: 20 }, requestId: request.id, attribution }, 71)
    const signal = await executionStarted.promise
    expect(signal.aborted).toBe(false)
    actions.setComputerUseTurbo(attribution.sessionId, 71, false)

    await expect(pending).resolves.toMatchObject({ isError: true, structuredContent: { status: 'unknown', doNotReplay: true, pendingActionId: 'pending-revoked-turbo' } })
    expect(signal.aborted).toBe(true)
    expect(presentComputerUse).not.toHaveBeenCalled()
    expect(clientMocks.privateRequest).toHaveBeenCalledOnce()
  })

  // https://github.com/moeru-ai/airi/pull/3496
  // ROOT CAUSE:
  //
  // After `dispatched` is set, only an aborted authorization signal returned
  // `unknown` with `doNotReplay`. A timeout or a lost reply rethrew, so the
  // model could replay an action that may already have reached the desktop.
  //
  // We fixed this by returning `unknown` with `doNotReplay` for every failure
  // after dispatch, not only for abort.
  it.each([
    'MCP request timed out',
    'connection closed',
    'response lost',
  ])('returns unknown with doNotReplay when a dispatched Computer Use reply fails with %s', async (message) => {
    const actions = new PendingActionManager()
    const attribution = { sessionId: 'session-lost-reply', turnId: 'turn-lost-reply', toolCallId: 'call-lost-reply' }
    const request = actions.registerRequest({ sessionId: attribution.sessionId, turnId: attribution.turnId, text: 'Change the desktop.' }, 71)
    actions.setComputerUseTurbo(attribution.sessionId, 71, true)
    const presentComputerUse = vi.fn(async () => false)
    const manager = createMcpManager({
      actions,
      present: vi.fn(async () => false),
      presentComputerUse,
      executeInSlot: async operation => operation(new AbortController().signal, () => {}),
      notify: async notice => ({ status: 'stored', sessionId: notice.sessionId, messageId: 'fixture' }),
    })
    managers.push(manager)
    await manager.writeConfigText(JSON.stringify({ terminalEnabled: true, mcpServers: {} }))
    await manager.applyAndRestart()
    clientMocks.listTools.mockResolvedValue({ tools: [{ name: 'computer_act', inputSchema: { type: 'object' } }] })
    clientMocks.callTool.mockResolvedValue({ content: [], structuredContent: { status: 'approval_required', pendingActionId: 'pending-lost-reply', toolName: 'computer_act', action: { kind: 'click', input: { x: 10, y: 20 } } } })
    clientMocks.privateRequest.mockRejectedValue(new Error(message))

    const result = await manager.callTool({ name: 'airi-terminal::computer_act', arguments: { x: 10, y: 20 }, requestId: request.id, attribution }, 71)
    expect(result).toMatchObject({
      isError: true,
      structuredContent: { status: 'unknown', doNotReplay: true, pendingActionId: 'pending-lost-reply' },
    })
    expect(result.structuredContent).not.toMatchObject({ status: 'executed' })
    expect(presentComputerUse).not.toHaveBeenCalled()
    expect(clientMocks.privateRequest).toHaveBeenCalledOnce()
  })

  it('reports cancelled without doNotReplay when aborted before Computer Use dispatch', async () => {
    const actions = new PendingActionManager()
    const attribution = { sessionId: 'session-pre-dispatch', turnId: 'turn-pre-dispatch', toolCallId: 'call-pre-dispatch' }
    const request = actions.registerRequest({ sessionId: attribution.sessionId, turnId: attribution.turnId, text: 'Change the desktop.' }, 71)
    const abort = new AbortController()
    const presentComputerUse = vi.fn(async (_request, signal?: AbortSignal) => {
      abort.abort(new Error('user cancelled before dispatch'))
      signal?.throwIfAborted()
      return false
    })
    const manager = createMcpManager({
      actions,
      present: vi.fn(async () => false),
      presentComputerUse,
      executeInSlot: async operation => operation(new AbortController().signal, () => {}),
      notify: async notice => ({ status: 'stored', sessionId: notice.sessionId, messageId: 'fixture' }),
    })
    managers.push(manager)
    await manager.writeConfigText(JSON.stringify({ terminalEnabled: true, mcpServers: {} }))
    await manager.applyAndRestart()
    clientMocks.listTools.mockResolvedValue({ tools: [{ name: 'computer_act', inputSchema: { type: 'object' } }] })
    clientMocks.callTool.mockResolvedValue({ content: [], structuredContent: { status: 'approval_required', pendingActionId: 'pending-pre-dispatch', toolName: 'computer_act', action: { kind: 'click', input: { x: 10, y: 20 } } } })

    const result = await manager.callTool({ name: 'airi-terminal::computer_act', arguments: { x: 10, y: 20 }, requestId: request.id, attribution }, 71, abort.signal)
    expect(result).toMatchObject({
      isError: true,
      structuredContent: { status: 'cancelled', pendingActionId: 'pending-pre-dispatch' },
    })
    expect(result.structuredContent).not.toMatchObject({ doNotReplay: true })
    expect(result.structuredContent).not.toMatchObject({ status: 'unknown' })
    expect(result.structuredContent).not.toMatchObject({ status: 'executed' })
    expect(presentComputerUse).toHaveBeenCalledOnce()
    expect(clientMocks.privateRequest.mock.calls.every(([payload]) => payload.method !== 'airi/computer-use/execute-prepared')).toBe(true)
  })

  it('starts the bundled Terminal in a new packaged Beta profile without external Node or a persisted install path', async () => {
    appMock.isPackaged = true
    vi.stubEnv('AIRI_DISTRIBUTION', 'terminal-beta')
    const manager = createMcpManager()
    managers.push(manager)

    const result = await manager.applyAndRestart()

    expect(result.started).toEqual([{ name: 'airi-terminal' }])
    expect(manager.getRuntimeStatus().servers).toMatchObject([{ name: 'airi-terminal', state: 'running', command: process.execPath, args: [join(userDataPath, 'app', 'out', 'bundle', 'main', 'terminal.mjs')] }])
    expect(JSON.parse((await manager.readConfigText()).text)).toEqual({ terminalEnabled: true, mcpServers: {} })
  })

  it('reports a closed current connection as stopped', async () => {
    const manager = await startServers('memory')

    clientMocks.instances[0].onclose?.()

    expect(manager.getRuntimeStatus().servers[0].state).toBe('stopped')
    await expect(manager.listTools()).resolves.toEqual([])
  })

  it('reports a discovery failure without presenting a stale connected state', async () => {
    const manager = await startServers('memory')
    clientMocks.listTools.mockRejectedValueOnce(new Error('Fixture connection unavailable.'))

    await expect(manager.listTools()).rejects.toThrow('Fixture connection unavailable.')

    expect(manager.getRuntimeStatus().servers[0]).toMatchObject({ state: 'error', lastError: 'Fixture connection unavailable.' })
  })

  it('ignores a replaced connection close callback and keeps the current connection identity', async () => {
    const manager = await startServers('memory')
    const previous = clientMocks.instances[0]
    await manager.applyAndRestart()
    const current = clientMocks.instances[1]

    previous.onclose?.()
    expect(manager.getRuntimeStatus().servers[0].state).toBe('running')
    current.onclose?.()
    expect(manager.getRuntimeStatus().servers[0].state).toBe('stopped')
  })

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
    const context = createContext<ElectronMainContextExtensions, ElectronMainEmitOptions>()
    createMcpServersService({ context, manager })
    const listMcpTools = defineInvoke(context, electronMcpListTools)
    const callMcpTool = defineInvoke(context, electronMcpCallTool)
    const [listTools] = await createMcpTools({
      listTools: name => listMcpTools(name === undefined ? undefined : { name }),
      callTool: payload => callMcpTool(payload),
    }, { proxy: 'active' })
    clientMocks.listTools.mockRejectedValueOnce(new Error('MCP request timed out.'))

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

  it('queries only the named server for an exact schema through Eventa', async () => {
    const manager = await startServers('external', 'terminal')
    const context = createContext<ElectronMainContextExtensions, ElectronMainEmitOptions>()
    createMcpServersService({ context, manager })
    const listMcpTools = defineInvoke(context, electronMcpListTools)
    clientMocks.listTools.mockImplementation(async function (this: Pick<Client, 'onclose' | 'onerror'>) {
      if (this === clientMocks.instances[0])
        throw new Error('Unrelated service unavailable.')
      return { tools: [{ name: 'scope::exec', inputSchema: { type: 'object' } }, { name: 'other', inputSchema: { type: 'object' } }] }
    })

    await expect(listMcpTools({ name: 'terminal::scope::exec' })).resolves.toEqual([
      expect.objectContaining({ name: 'terminal::scope::exec', toolName: 'scope::exec' }),
    ])
    expect(clientMocks.listTools).toHaveBeenCalledOnce()
    expect(clientMocks.callTool).not.toHaveBeenCalled()
  })

  it('does not trust an external server to mark itself direct', async () => {
    const manager = await startServers('external')
    clientMocks.listTools.mockResolvedValue({ tools: [{ name: 'terminal_exec', exposure: 'direct', inputSchema: { type: 'object', properties: {} } }] })
    expect((await manager.listTools())[0].exposure).toBe('router-only')
  })

  it('applies Host exposure overrides consistently to discovery and calls', async () => {
    const actions = new PendingActionManager()
    const manager = createMcpManager({
      actions,
      present: vi.fn(async () => false),
      presentComputerUse: vi.fn(async () => false),
      executeInSlot: async operation => operation(new AbortController().signal, () => {}),
      notify: async notice => ({ status: 'stored', sessionId: notice.sessionId, messageId: `fixture:${notice.actionId}` }),
    })
    managers.push(manager)
    await manager.writeConfigText(JSON.stringify({
      terminalEnabled: true,
      toolExposure: {
        'airi-terminal::desktop_click': 'direct',
        'airi-terminal::desktop_get_state': 'router-only',
        'airi-terminal::desktop_get_session_trace': 'direct',
        'airi-terminal::computer_act': 'router-only',
        'airi-terminal::terminal_exec': 'disabled',
      },
      mcpServers: {},
    }))
    await manager.applyAndRestart()
    clientMocks.listTools.mockResolvedValue({ tools: [
      { name: 'desktop_click', inputSchema: { type: 'object' } },
      { name: 'desktop_get_state', inputSchema: { type: 'object' } },
      { name: 'desktop_get_session_trace', inputSchema: { type: 'object' } },
      { name: 'computer_act', inputSchema: { type: 'object' } },
      { name: 'terminal_exec', inputSchema: { type: 'object' } },
    ] })

    const descriptors = await manager.listTools()
    expect(descriptors.map(tool => [tool.toolName, tool.exposure])).toEqual([
      ['desktop_click', 'disabled'],
      ['desktop_get_state', 'disabled'],
      ['desktop_get_session_trace', 'disabled'],
      ['computer_act', 'router-only'],
      ['terminal_exec', 'disabled'],
    ])
    for (const name of [
      'airi-terminal::desktop_get_session_trace',
      'airi-terminal::desktop_get_state',
      'airi-terminal::desktop_click',
      'airi-terminal::terminal_exec',
    ]) {
      await expect(manager.callTool({ name })).resolves.toEqual({
        dispatchOutcome: 'failed_before_dispatch',
        isError: true,
        content: [{ type: 'text', text: `MCP tool is disabled by the Host: ${name}` }],
      })
    }
    expect(clientMocks.callTool).not.toHaveBeenCalled()
  })

  // https://github.com/moeru-ai/airi/pull/3496
  // ROOT CAUSE:
  // The SDK returns one page per request and replaces its metadata after each list call.
  // The client collects all pages before the SDK installs the catalog.
  it('returns later MCP pages through exact and full discovery (PR #3496)', async () => {
    const manager = await startServers('fixture')
    const tools = ['first', 'inspect', 'last'].map(name => ({ name, inputSchema: { type: 'object' } }))
    const page = (index: number) => ({
      tools: [tools[index]],
      nextCursor: index < tools.length - 1 ? String(index + 1) : undefined,
    })
    clientMocks.listTools.mockImplementation(async params => page(Number(params?.cursor ?? 0)))
    const [list] = await createMcpTools({ listTools: manager.listTools, callTool: payload => manager.callTool(payload) }, { proxy: 'active' })
    const result = await list.execute({ name: 'fixture::inspect' }, { messages: [], toolCallId: 'discovery' })

    expect(result).toMatchObject([{ name: 'fixture::inspect', inputSchema: tools[1].inputSchema }])
    expect(clientMocks.listTools.mock.calls.map(([params]) => params?.cursor)).toEqual([undefined, '1', '2'])
    expect((await manager.listTools()).map(tool => tool.toolName)).toEqual(['first', 'inspect', 'last'])
    expect(clientMocks.callTool).not.toHaveBeenCalled()
  })

  // https://github.com/moeru-ai/airi/pull/3496
  // ROOT CAUSE:
  // Main checked the Terminal request lifetime for calls to any MCP server.
  // Only the bundled Terminal execution path checks that lifetime.
  it('keeps external MCP calls independent of the Terminal request TTL (PR #3496)', async () => {
    const actions = new PendingActionManager()
    const manager = createMcpManager({
      actions,
      present: vi.fn(async () => false),
      presentComputerUse: vi.fn(async () => false),
      executeInSlot: async operation => operation(new AbortController().signal, () => {}),
      notify: async notice => ({ status: 'stored', sessionId: notice.sessionId, messageId: `terminal:${notice.actionId}` }),
    })
    managers.push(manager)
    await manager.writeConfigText(JSON.stringify({ terminalEnabled: false, mcpServers: { fixture: { command: 'test-mcp-server' } } }))
    await manager.applyAndRestart()
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000)
      const origin = { sessionId: 'session-a', turnId: 'turn-a' }
      const request = actions.registerRequest({ ...origin, text: 'Read fixture metadata.' }, 71)
      const attribution = { ...origin, toolCallId: 'read-a' }
      const result = { content: [{ type: 'text', text: 'Fixture metadata.' }] } satisfies CallToolResult
      clientMocks.callTool.mockResolvedValue(result)
      const payload = { name: 'fixture::read', requestId: request.id, attribution }
      await expect(manager.callTool(payload, 71)).resolves.toEqual({
        ...result,
        dispatchOutcome: 'response_received',
      })
      vi.setSystemTime(request.expiresAt)
      await expect(manager.callTool(payload, 71)).resolves.toEqual({
        ...result,
        dispatchOutcome: 'response_received',
      })
      expect(clientMocks.callTool).toHaveBeenCalledTimes(2)
      expect(clientMocks.callTool).toHaveBeenLastCalledWith(
        { name: 'read', arguments: {} },
        undefined,
        expect.any(Object),
      )
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('treats successful discovery with no tools as an empty catalog', async () => {
    const manager = await startServers('memory')

    expect(await manager.listTools()).toEqual([])
    expect(clientMocks.listTools).toHaveBeenCalledWith(undefined, expect.objectContaining({ timeout: 10_000, maxTotalTimeout: 15_000, signal: expect.any(AbortSignal) }))
  })

  it('returns every descriptor in server name order when all queries succeed', async () => {
    const manager = await startServers('zeta', 'alpha')
    clientMocks.listTools
      .mockResolvedValueOnce({ tools: [{ name: 'read', description: 'Read memory.', inputSchema: { type: 'object' } }] })
      .mockResolvedValueOnce({ tools: [{ name: 'search', description: 'Search files.', inputSchema: { type: 'object' } }] })

    expect(await manager.listTools()).toEqual([
      { serverName: 'alpha', name: 'alpha::read', toolName: 'read', description: 'Read memory.', inputSchema: { type: 'object' }, exposure: 'router-only', defaultExposure: 'router-only' },
      { serverName: 'zeta', name: 'zeta::search', toolName: 'search', description: 'Search files.', inputSchema: { type: 'object' }, exposure: 'router-only', defaultExposure: 'router-only' },
    ])
  })

  it('keeps only stable Agent tools direct behind Main request ownership', async () => {
    const actions = new PendingActionManager()
    const manager = createMcpManager({
      actions,
      present: vi.fn(async () => false),
      presentComputerUse: vi.fn(async () => false),
      executeInSlot: async operation => operation(new AbortController().signal, () => {}),
      notify: async notice => ({ status: 'stored', sessionId: notice.sessionId, messageId: 'fixture' }),
    })
    managers.push(manager)
    await manager.writeConfigText(JSON.stringify({ terminalEnabled: true, mcpServers: {} }))
    await manager.applyAndRestart()
    const desktopTools = [
      'desktop_screenshot',
      'desktop_click',
      'desktop_ensure_chrome',
      'desktop_approve_pending_action',
      'accessibility_snapshot',
      'display_enumerate',
      'browser_dom_click',
      'workflow_run_tests',
      'pty_create',
      'pty_send_input',
      'pty_write',
      'terminal_get_state',
      'terminal_reset_state',
    ]
    clientMocks.listTools.mockResolvedValue({ tools: ['terminal_exec', 'terminal_history', ...desktopTools].map(name => ({ name, description: 'Configured Shell executable: fixture-shell.', inputSchema: { type: 'object', properties: { command: { type: 'string' } } }, exposure: 'direct' })) })
    const descriptors = await manager.listTools()
    expect(descriptors.map(tool => [tool.toolName, tool.exposure])).toEqual([
      ['terminal_exec', 'direct'],
      ['terminal_history', 'disabled'],
      ['desktop_screenshot', 'disabled'],
      ['desktop_click', 'disabled'],
      ['desktop_ensure_chrome', 'disabled'],
      ['desktop_approve_pending_action', 'disabled'],
      ['accessibility_snapshot', 'disabled'],
      ['display_enumerate', 'disabled'],
      ['browser_dom_click', 'disabled'],
      ['workflow_run_tests', 'disabled'],
      ['pty_create', 'disabled'],
      ['pty_send_input', 'disabled'],
      ['pty_write', 'disabled'],
      ['terminal_get_state', 'disabled'],
      ['terminal_reset_state', 'disabled'],
    ])
    for (const tool of desktopTools) {
      await expect(manager.callTool({ name: `airi-terminal::${tool}` })).resolves.toEqual({
        dispatchOutcome: 'failed_before_dispatch',
        isError: true,
        content: [{ type: 'text', text: `MCP tool is disabled by the Host: airi-terminal::${tool}` }],
      })
    }
    await expect(manager.callTool({ name: 'airi-terminal::terminal_history' })).resolves.toEqual({
      dispatchOutcome: 'failed_before_dispatch',
      isError: true,
      content: [{ type: 'text', text: 'MCP tool is disabled by the Host: airi-terminal::terminal_history' }],
    })
    await expect(manager.callTool({ name: 'airi-terminal::terminal_exec', arguments: { command: 'fixture' } })).resolves.toEqual({
      dispatchOutcome: 'failed_before_dispatch',
      isError: true,
      content: [{ type: 'text', text: 'Host-controlled MCP actions require a normal Chat request registered by the Host.' }],
    })
    expect(clientMocks.callTool).not.toHaveBeenCalled()
    const attribution = { sessionId: 'session-a', turnId: 'turn-a' }
    actions.setTerminalTurbo(attribution.sessionId, 71, true)
    for (const tool of desktopTools) {
      await expect(manager.callTool({ name: `airi-terminal::${tool}`, attribution }, 71)).resolves.toEqual({
        dispatchOutcome: 'failed_before_dispatch',
        isError: true,
        content: [{ type: 'text', text: `MCP tool is disabled by the Host: airi-terminal::${tool}` }],
      })
    }
    await expect(manager.callTool({ name: 'airi-terminal::terminal_history', attribution }, 71)).resolves.toEqual({
      dispatchOutcome: 'failed_before_dispatch',
      isError: true,
      content: [{ type: 'text', text: 'MCP tool is disabled by the Host: airi-terminal::terminal_history' }],
    })
    expect(clientMocks.callTool).not.toHaveBeenCalled()
    const request = actions.registerRequest({ ...attribution, text: 'Run the fixture.' }, 71)
    const tools = await resolveLlmTools({ builtInTools: [], debugTools: [], sparkCommandTools: [], webSearchTools: [], activeTools: await createMcpTools({
      listTools: manager.listTools,
      callTool: (payload, options) => manager.callTool({ ...payload, requestId: request.id, attribution: options?.attribution }, 71, options?.abortSignal),
    }, { direct: await manager.listTools() }), attribution })
    clientMocks.callTool.mockResolvedValue({ isError: true, content: [{ type: 'text', text: 'Fixture policy rejected preparation.' }] })
    const terminal = tools.find(tool => tool.function.name === 'terminal_exec')!
    expect(tools.some(tool => tool.function.name === 'desktop_screenshot')).toBe(false)
    expect(terminal.function.description).toContain('Configured Shell executable: fixture-shell.')
    expect(terminal.function.description).toContain('The bundled MCP includes AUV desktop observation and input.')
    expect(terminal.function.description).not.toContain('offers no desktop capture or input')
    expect(terminal.function.description).toContain('Use confirmed facts to work toward the user’s goal.')
    expect(terminal.function.description).toContain('choose an observation that can resolve the gap')
    expect(terminal.function.description).toContain('Verify the requested outcome before reporting completion.')
    expect(descriptors.find(descriptor => descriptor.toolName === 'terminal_history')?.description).toBe('Configured Shell executable: fixture-shell.')
    const result = await terminal.execute({ command: 'fixture', call_summary: 'Run fixture', call_icon: [] }, { messages: [], toolCallId: 'direct-call' })
    expect(result).toMatchObject({ isError: true })
    expect(clientMocks.callTool).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: 'terminal_exec', arguments: { command: 'fixture' }, _meta: expect.any(Object) }), undefined, expect.any(Object))
    actions.cancelRequest(request.id, 71)
    const cancelled = await terminal.execute({ command: 'fixture' }, { messages: [], toolCallId: 'cancelled-call' })
    expect(cancelled).toMatchObject({ isError: true })
    expect(clientMocks.callTool).toHaveBeenCalledTimes(1)
    console.info(JSON.stringify({ boundary: 'Real Resolver and Main, controlled MCP client; policy rejection, no executor', prepareCalls: clientMocks.callTool.mock.calls.length, nativeExecutions: 0, disabledDispatches: 0 }))
  })

  it.each(['terminal_exec', 'stdio::terminal_exec', '.stdio::terminal_exec', 'scope::terminal_exec'])(
    'calls the exact advertised tool name %s once',
    async (toolName) => {
      const manager = await startServers('terminal')
      clientMocks.listTools.mockResolvedValue({ tools: [{ name: toolName, inputSchema: { type: 'object' } }] })
      let effects = 0
      clientMocks.callTool.mockImplementation(async () => {
        effects += 1
        return { content: [{ type: 'text', text: 'done' }] }
      })
      const [descriptor] = await manager.listTools()

      await manager.callTool({ name: descriptor.name, arguments: { command: 'fixture-operation' } })

      expect(descriptor.toolName).toBe(toolName)
      expect(clientMocks.callTool).toHaveBeenCalledOnce()
      expect(clientMocks.callTool).toHaveBeenCalledWith(
        { name: toolName, arguments: { command: 'fixture-operation' } },
        undefined,
        expect.objectContaining({ timeout: 10_000, maxTotalTimeout: 15_000, signal: expect.any(AbortSignal) }),
      )
      expect(effects).toBe(1)
    },
  )

  it.each(['response lost', 'connection closed', 'request timed out'])(
    'preserves %s after a committed effect without trying an alias',
    async (message) => {
      const manager = await startServers('terminal')
      const error = new Error(message)
      let effects = 0
      clientMocks.callTool.mockImplementation(async () => {
        effects += 1
        throw error
      })

      await expect(manager.callTool({ name: 'terminal::stdio::write' })).rejects.toBe(error)

      expect(clientMocks.callTool).toHaveBeenCalledOnce()
      expect(effects).toBe(1)
    },
  )

  it('marks an MCP error result as response received without dispatching again', async () => {
    const manager = await startServers('terminal')
    const denial = { isError: true, content: [{ type: 'text', text: 'Action denied.' }] } satisfies CallToolResult
    let effects = 0
    clientMocks.callTool.mockImplementation(async ({ name }) => {
      if (name === 'write')
        effects += 1
      return denial
    })

    expect(await manager.callTool({ name: 'terminal::stdio::write' })).toEqual({
      ...denial,
      dispatchOutcome: 'response_received',
    })
    expect(clientMocks.callTool).toHaveBeenCalledOnce()
    expect(effects).toBe(0)
  })

  it('passes unknown call outcomes through createMcpTools without redispatching', async () => {
    const manager = await startServers('terminal')
    let effects = 0
    clientMocks.callTool.mockImplementation(async () => {
      effects += 1
      throw new Error('MCP connection closed.')
    })
    const [, callTool] = await createMcpTools({
      listTools: async () => [],
      callTool: payload => manager.callTool(payload),
    }, { proxy: 'active' })

    const result = await callTool.execute({ name: 'terminal::stdio::write', arguments: '{}' }, { messages: [], toolCallId: 'unknown-outcome' })

    expect(result).toEqual({
      dispatchOutcome: 'outcome_unknown',
      isError: true,
      content: [{ type: 'text', text: 'MCP connection closed.' }],
    })
    expect(clientMocks.callTool).toHaveBeenCalledOnce()
    expect(effects).toBe(1)
  })

  // https://github.com/moeru-ai/airi/pull/3473
  // ROOT CAUSE:
  //
  // The manager rejected invalid names and missing sessions before transport dispatch.
  // The shared MCP tool wrapper treated every rejection as an unknown outcome.
  // We now return a typed error result before dispatch and reserve rejections for transport failures.
  it.each([
    { scenario: 'an invalid tool name', serverNames: ['terminal'], name: 'invalid-name', error: 'invalid qualified tool name: invalid-name' },
    { scenario: 'an inactive server', serverNames: [], name: 'offline::write', error: 'mcp server is not running: offline' },
  ])('marks $scenario as failed before dispatch', async ({ serverNames, name, error }) => {
    const manager = await startServers(...serverNames)
    const [, callTool] = await createMcpTools({
      listTools: async () => [],
      callTool: payload => manager.callTool(payload),
    }, { proxy: 'active' })

    const result = await callTool.execute({ name, arguments: '{}' }, { messages: [], toolCallId: 'failed-before-dispatch' })

    expect(result).toEqual({
      dispatchOutcome: 'failed_before_dispatch',
      isError: true,
      content: [{ type: 'text', text: error }],
    })
    expect(clientMocks.callTool).not.toHaveBeenCalled()
  })

  it('does not guess another tool when the requested tool is absent', async () => {
    const manager = await startServers('terminal')
    const error = new Error('Unknown tool: missing::write')
    let effects = 0
    clientMocks.callTool.mockImplementation(async ({ name }) => {
      if (name !== 'write')
        throw error
      effects += 1
      return { content: [{ type: 'text', text: 'unexpected write' }] }
    })

    await expect(manager.callTool({ name: 'terminal::missing::write' })).rejects.toBe(error)

    expect(clientMocks.callTool).toHaveBeenCalledOnce()
    expect(effects).toBe(0)
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
