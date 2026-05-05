import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { ComputerUseServerRuntime } from './runtime'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RunStateManager } from '../state'
import { createPtySession, isPtyAvailable } from '../terminal/pty-runner'
import { createTestConfig } from '../test-fixtures'
import { registerComputerUseTools } from './register-tools'

vi.mock('../terminal/pty-runner', () => ({
  createPtySession: vi.fn(),
  destroyAllPtySessions: vi.fn(),
  destroyPtySession: vi.fn(),
  getPtyAvailabilityInfo: vi.fn().mockResolvedValue({ available: true }),
  isPtyAvailable: vi.fn(),
  listPtySessions: vi.fn(),
  readPtyScreen: vi.fn(),
  resizePty: vi.fn(),
  writeToPty: vi.fn(),
}))

type ToolHandler = (args: Record<string, unknown>) => Promise<any>

function createMockServer() {
  const handlers = new Map<string, ToolHandler>()

  return {
    server: {
      tool(name: string, _schema: unknown, handler: ToolHandler) {
        handlers.set(name, handler)
      },
    } as unknown as McpServer,
    async invoke(name: string, args: Record<string, unknown> = {}) {
      const handler = handlers.get(name)
      if (!handler) {
        throw new Error(`Missing registered tool: ${name}`)
      }

      return await handler(args)
    },
  }
}

describe('registerComputerUseTools: PTY approval bridge', () => {
  let runtime: ComputerUseServerRuntime
  let pendingActions: Map<string, Record<string, unknown>>

  beforeEach(() => {
    pendingActions = new Map()
    runtime = {
      config: createTestConfig({ approvalMode: 'actions' }),
      stateManager: new RunStateManager(),
      session: {
        createPendingAction: vi.fn(),
        getPendingAction: vi.fn((id: string) => pendingActions.get(id)),
        listPendingActions: vi.fn(() => [...pendingActions.values()]),
        removePendingAction: vi.fn((id: string) => pendingActions.delete(id)),
        record: vi.fn().mockResolvedValue(undefined),
        consumeOperation: vi.fn(),
        getBudgetState: vi.fn(() => ({ operationsExecuted: 0, operationUnitsConsumed: 0 })),
        getLastScreenshot: vi.fn(() => undefined),
      },
      executor: {
        getPermissionInfo: vi.fn().mockResolvedValue({}),
      },
      terminalRunner: {
        getState: vi.fn(() => ({ effectiveCwd: '/tmp' })),
      },
      browserDomBridge: {
        triggerEvent: vi.fn(),
        clickSelector: vi.fn(),
        getStatus: vi.fn(() => ({ enabled: false, connected: false })),
        supportsAction: vi.fn(() => true),
      },
      cdpBridgeManager: {
        getAvailability: vi.fn(),
        probeAvailability: vi.fn().mockResolvedValue({
          endpoint: undefined,
          connected: false,
          connectable: false,
          lastError: 'CDP unavailable',
        }),
        ensureBridge: vi.fn(),
      },
      chromeSessionManager: {
        ensureAgentWindow: vi.fn(),
      },
      desktopSessionController: {
        getSession: vi.fn(() => null),
        begin: vi.fn(() => ({ id: 'desktop-session-1' })),
        addOwnedWindow: vi.fn(),
      },
      taskMemory: {},
    } as unknown as ComputerUseServerRuntime
    vi.clearAllMocks()
  })

  it('executes approved pending pty_create through desktop_approve_pending_action', async () => {
    vi.mocked(isPtyAvailable).mockResolvedValue(true)
    vi.mocked(createPtySession).mockResolvedValue({
      id: 'pty_approved',
      alive: true,
      rows: 24,
      cols: 80,
      screenContent: '',
      pid: 4321,
    })

    pendingActions.set('pending-pty-1', {
      id: 'pending-pty-1',
      createdAt: new Date().toISOString(),
      toolName: 'pty_create',
      action: {
        kind: 'pty_create',
        input: {
          rows: 24,
          cols: 80,
          cwd: '/tmp/project',
          approvalSessionId: 'approval_1',
        },
      },
      policy: {
        allowed: true,
        requiresApproval: true,
        reasons: ['Creating an interactive PTY session requires approval.'],
        riskLevel: 'high',
        estimatedOperationUnits: 4,
      },
      context: {
        available: false,
        platform: 'darwin',
      },
    })

    const { server, invoke } = createMockServer()
    registerComputerUseTools({
      server,
      runtime,
      executeAction: vi.fn(),
      enableTestTools: false,
    })

    const result = await invoke('desktop_approve_pending_action', { id: 'pending-pty-1' })

    expect((result.structuredContent as Record<string, any>).status).toBe('ok')
    expect(createPtySession).toHaveBeenCalledWith(runtime.config, {
      rows: 24,
      cols: 80,
      cwd: '/tmp/project',
    })
    expect(runtime.stateManager.getActivePtyGrants()).toEqual([
      expect.objectContaining({
        approvalSessionId: 'approval_1',
        ptySessionId: 'pty_approved',
        active: true,
      }),
    ])
    expect((runtime.session.getPendingAction as any)('pending-pty-1')).toBeUndefined()
  })

  it('executes approved pending desktop_ensure_chrome through the Chrome session manager', async () => {
    ;(runtime.chromeSessionManager.ensureAgentWindow as any).mockResolvedValue({
      wasAlreadyRunning: false,
      windowId: 'chrome-window-1',
      pid: 4242,
      agentOwned: true,
      cdpUrl: 'http://127.0.0.1:9333',
      initialUrl: 'https://example.com',
      createdAt: new Date().toISOString(),
    })
    ;(runtime.cdpBridgeManager.probeAvailability as any).mockResolvedValue({
      endpoint: 'ws://127.0.0.1/devtools/browser/1',
      connected: false,
      connectable: true,
    })

    pendingActions.set('pending-chrome-1', {
      id: 'pending-chrome-1',
      createdAt: new Date().toISOString(),
      toolName: 'desktop_ensure_chrome',
      action: {
        kind: 'desktop_ensure_chrome',
        input: {
          url: 'https://example.com',
          cdpPort: 9333,
        },
      },
      policy: {
        allowed: true,
        requiresApproval: true,
        reasons: ['Opening Chrome requires approval.'],
        riskLevel: 'medium',
        estimatedOperationUnits: 2,
      },
      context: {
        available: true,
        appName: 'Finder',
        platform: 'darwin',
      },
    })

    const executeAction = vi.fn()
    const { server, invoke } = createMockServer()
    registerComputerUseTools({
      server,
      runtime,
      executeAction,
      enableTestTools: false,
    })

    const result = await invoke('desktop_approve_pending_action', { id: 'pending-chrome-1' })

    expect(result.isError).not.toBe(true)
    expect(runtime.chromeSessionManager.ensureAgentWindow).toHaveBeenCalledWith({
      url: 'https://example.com',
      cdpPort: 9333,
    })
    expect(runtime.cdpBridgeManager.ensureBridge).toHaveBeenCalledWith('http://127.0.0.1:9333')
    expect(runtime.stateManager.getState().chromeSession).toMatchObject({
      windowId: 'chrome-window-1',
      pid: 4242,
    })
    expect(runtime.session.consumeOperation).toHaveBeenCalledWith(2)
    expect(executeAction).not.toHaveBeenCalled()
    expect((runtime.session.getPendingAction as any)('pending-chrome-1')).toBeUndefined()
  })

  it('returns a structured error when browser_dom_trigger_event receives malformed optsJson', async () => {
    ;(runtime.browserDomBridge.getStatus as any).mockReturnValue({
      enabled: true,
      connected: true,
      host: '127.0.0.1',
      port: 8765,
      pendingRequests: 0,
    })

    const { server, invoke } = createMockServer()
    registerComputerUseTools({
      server,
      runtime,
      executeAction: vi.fn(),
      enableTestTools: false,
    })

    const result = await invoke('browser_dom_trigger_event', {
      selector: '#app',
      eventName: 'click',
      optsJson: '{not-valid-json}',
    })

    expect(result.isError).toBe(true)
    expect(result.structuredContent).toMatchObject({
      status: 'invalid_params',
      field: 'optsJson',
    })
    expect((runtime.browserDomBridge.triggerEvent as any)).not.toHaveBeenCalled()
  })

  it('rejects browser_dom_click when the connected extension transport is read-only', async () => {
    ;(runtime.browserDomBridge.getStatus as any).mockReturnValue({
      enabled: true,
      connected: true,
      host: '127.0.0.1',
      port: 8765,
      pendingRequests: 0,
    })
    ;(runtime.browserDomBridge.supportsAction as any).mockImplementation((action: string) => action !== 'clickAt')

    const { server, invoke } = createMockServer()
    registerComputerUseTools({
      server,
      runtime,
      executeAction: vi.fn(),
      enableTestTools: false,
    })

    const result = await invoke('browser_dom_click', {
      selector: '#submit',
    })

    expect(result.isError).toBe(true)
    expect(result.structuredContent).toMatchObject({
      status: 'unavailable',
      unsupportedActions: ['clickAt'],
    })
    expect((runtime.browserDomBridge.clickSelector as any)).not.toHaveBeenCalled()
  })

  it('rejects browser_dom_trigger_event when the connected extension transport does not support writes', async () => {
    ;(runtime.browserDomBridge.getStatus as any).mockReturnValue({
      enabled: true,
      connected: true,
      host: '127.0.0.1',
      port: 8765,
      pendingRequests: 0,
    })
    ;(runtime.browserDomBridge.supportsAction as any).mockImplementation((action: string) => action !== 'triggerEvent')

    const { server, invoke } = createMockServer()
    registerComputerUseTools({
      server,
      runtime,
      executeAction: vi.fn(),
      enableTestTools: false,
    })

    const result = await invoke('browser_dom_trigger_event', {
      selector: '#app',
      eventName: 'click',
    })

    expect(result.isError).toBe(true)
    expect(result.structuredContent).toMatchObject({
      status: 'unavailable',
      unsupportedActions: ['triggerEvent'],
    })
    expect((runtime.browserDomBridge.triggerEvent as any)).not.toHaveBeenCalled()
  })
})
