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
    async invoke(name: string, args: Record<string, unknown> = {}) {
      const handler = handlers.get(name)
      if (!handler) {
        throw new Error(`Missing registered tool: ${name}`)
      }

      return await handler(args)
    },
    server: {
      tool(name: string, _schema: unknown, handler: ToolHandler) {
        handlers.set(name, handler)
      },
    } as unknown as McpServer,
  }
}

describe('registerComputerUseTools: PTY approval bridge', () => {
  let runtime: ComputerUseServerRuntime
  let pendingActions: Map<string, Record<string, unknown>>

  beforeEach(() => {
    pendingActions = new Map()
    runtime = {
      browserDomBridge: {
        clickSelector: vi.fn(),
        getStatus: vi.fn(() => ({ connected: false, enabled: false })),
        supportsAction: vi.fn(() => true),
        triggerEvent: vi.fn(),
        waitForElement: vi.fn(),
      },
      cdpBridgeManager: {
        ensureBridge: vi.fn(),
        getAvailability: vi.fn(),
        probeAvailability: vi.fn().mockResolvedValue({
          connectable: false,
          connected: false,
          endpoint: undefined,
          lastError: 'CDP unavailable',
        }),
      },
      chromeSessionManager: {
        ensureAgentWindow: vi.fn(),
      },
      config: createTestConfig({ approvalMode: 'actions' }),
      desktopSessionController: {
        addOwnedWindow: vi.fn(),
        begin: vi.fn(() => ({ id: 'desktop-session-1' })),
        getSession: vi.fn(() => null),
      },
      executor: {
        getPermissionInfo: vi.fn().mockResolvedValue({}),
      },
      session: {
        consumeOperation: vi.fn(),
        createPendingAction: vi.fn(),
        getBudgetState: vi.fn(() => ({ operationsExecuted: 0, operationUnitsConsumed: 0 })),
        getLastScreenshot: vi.fn(() => undefined),
        getPendingAction: vi.fn((id: string) => pendingActions.get(id)),
        listPendingActions: vi.fn(() => [...pendingActions.values()]),
        record: vi.fn().mockResolvedValue(undefined),
        removePendingAction: vi.fn((id: string) => pendingActions.delete(id)),
      },
      stateManager: new RunStateManager(),
      taskMemory: {},
      terminalRunner: {
        getState: vi.fn(() => ({ effectiveCwd: '/tmp' })),
      },
    } as unknown as ComputerUseServerRuntime
    vi.clearAllMocks()
  })

  it('executes approved pending pty_create through desktop_approve_pending_action', async () => {
    vi.mocked(isPtyAvailable).mockResolvedValue(true)
    vi.mocked(createPtySession).mockResolvedValue({
      alive: true,
      cols: 80,
      id: 'pty_approved',
      pid: 4321,
      rows: 24,
      screenContent: '',
    })

    pendingActions.set('pending-pty-1', {
      action: {
        input: {
          approvalSessionId: 'approval_1',
          cols: 80,
          cwd: '/tmp/project',
          rows: 24,
        },
        kind: 'pty_create',
      },
      context: {
        available: false,
        platform: 'darwin',
      },
      createdAt: new Date().toISOString(),
      id: 'pending-pty-1',
      policy: {
        allowed: true,
        estimatedOperationUnits: 4,
        reasons: ['Creating an interactive PTY session requires approval.'],
        requiresApproval: true,
        riskLevel: 'high',
      },
      toolName: 'pty_create',
    })

    const { invoke, server } = createMockServer()
    registerComputerUseTools({
      enableTestTools: false,
      executeAction: vi.fn(),
      runtime,
      server,
    })

    const result = await invoke('desktop_approve_pending_action', { id: 'pending-pty-1' })

    expect((result.structuredContent as Record<string, any>).status).toBe('ok')
    expect(createPtySession).toHaveBeenCalledWith(runtime.config, {
      cols: 80,
      cwd: '/tmp/project',
      rows: 24,
    })
    expect(runtime.stateManager.getActivePtyGrants()).toEqual([
      expect.objectContaining({
        active: true,
        approvalSessionId: 'approval_1',
        ptySessionId: 'pty_approved',
      }),
    ])
    expect((runtime.session.getPendingAction as any)('pending-pty-1')).toBeUndefined()
  })

  it('executes approved pending desktop_ensure_chrome through the Chrome session manager', async () => {
    ;(runtime.chromeSessionManager.ensureAgentWindow as any).mockResolvedValue({
      agentOwned: true,
      cdpUrl: 'http://127.0.0.1:9333',
      createdAt: new Date().toISOString(),
      initialUrl: 'https://example.com',
      pid: 4242,
      wasAlreadyRunning: false,
      windowId: 'chrome-window-1',
    })
    ;(runtime.cdpBridgeManager.probeAvailability as any).mockResolvedValue({
      connectable: true,
      connected: false,
      endpoint: 'ws://127.0.0.1/devtools/browser/1',
    })

    pendingActions.set('pending-chrome-1', {
      action: {
        input: {
          cdpPort: 9333,
          url: 'https://example.com',
        },
        kind: 'desktop_ensure_chrome',
      },
      context: {
        appName: 'Finder',
        available: true,
        platform: 'darwin',
      },
      createdAt: new Date().toISOString(),
      id: 'pending-chrome-1',
      policy: {
        allowed: true,
        estimatedOperationUnits: 2,
        reasons: ['Opening Chrome requires approval.'],
        requiresApproval: true,
        riskLevel: 'medium',
      },
      toolName: 'desktop_ensure_chrome',
    })

    const executeAction = vi.fn()
    const { invoke, server } = createMockServer()
    registerComputerUseTools({
      enableTestTools: false,
      executeAction,
      runtime,
      server,
    })

    const result = await invoke('desktop_approve_pending_action', { id: 'pending-chrome-1' })

    expect(result.isError).not.toBe(true)
    expect(runtime.chromeSessionManager.ensureAgentWindow).toHaveBeenCalledWith({
      cdpPort: 9333,
      url: 'https://example.com',
    })
    expect(runtime.cdpBridgeManager.ensureBridge).toHaveBeenCalledWith('http://127.0.0.1:9333')
    expect(runtime.stateManager.getState().chromeSession).toMatchObject({
      pid: 4242,
      windowId: 'chrome-window-1',
    })
    expect(runtime.session.consumeOperation).toHaveBeenCalledWith(2)
    expect(executeAction).not.toHaveBeenCalled()
    expect((runtime.session.getPendingAction as any)('pending-chrome-1')).toBeUndefined()
  })

  it('returns a structured error when browser_dom_trigger_event receives malformed optsJson', async () => {
    ;(runtime.browserDomBridge.getStatus as any).mockReturnValue({
      connected: true,
      enabled: true,
      host: '127.0.0.1',
      pendingRequests: 0,
      port: 8765,
    })

    const { invoke, server } = createMockServer()
    registerComputerUseTools({
      enableTestTools: false,
      executeAction: vi.fn(),
      runtime,
      server,
    })

    const result = await invoke('browser_dom_trigger_event', {
      eventName: 'click',
      optsJson: '{not-valid-json}',
      selector: '#app',
    })

    expect(result.isError).toBe(true)
    expect(result.structuredContent).toMatchObject({
      field: 'optsJson',
      status: 'invalid_params',
    })
    expect((runtime.browserDomBridge.triggerEvent as any)).not.toHaveBeenCalled()
  })

  it('rejects browser_dom_click when the connected extension transport is read-only', async () => {
    ;(runtime.browserDomBridge.getStatus as any).mockReturnValue({
      connected: true,
      enabled: true,
      host: '127.0.0.1',
      pendingRequests: 0,
      port: 8765,
    })
    ;(runtime.browserDomBridge.supportsAction as any).mockImplementation((action: string) => action !== 'clickAt')

    const { invoke, server } = createMockServer()
    registerComputerUseTools({
      enableTestTools: false,
      executeAction: vi.fn(),
      runtime,
      server,
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

  it('returns a browser repair suggestion when browser_dom_click throws a known selector error', async () => {
    ;(runtime.browserDomBridge.getStatus as any).mockReturnValue({
      connected: true,
      enabled: true,
      pendingRequests: 0,
    })
    ;(runtime.browserDomBridge.clickSelector as any).mockRejectedValue(
      new Error('selector "#submit" did not match any element'),
    )

    const { invoke, server } = createMockServer()
    registerComputerUseTools({
      enableTestTools: false,
      executeAction: vi.fn(),
      runtime,
      server,
    })

    const result = await invoke('browser_dom_click', {
      selector: '#submit',
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Re-read the page DOM')
    expect(result.structuredContent).toMatchObject({
      actionKind: 'browser_dom_click',
      repairSuggestion: {
        pattern: 'element_not_found',
        suggestedTool: 'browser_dom_read_page',
      },
      selector: '#submit',
      status: 'error',
    })
  })

  it('returns a browser repair suggestion when browser_dom_wait_for_element times out', async () => {
    ;(runtime.browserDomBridge.getStatus as any).mockReturnValue({
      connected: true,
      enabled: true,
      pendingRequests: 0,
    })
    ;(runtime.browserDomBridge.waitForElement as any).mockRejectedValue(
      new Error('timed out waiting for selector'),
    )

    const { invoke, server } = createMockServer()
    registerComputerUseTools({
      enableTestTools: false,
      executeAction: vi.fn(),
      runtime,
      server,
    })

    const result = await invoke('browser_dom_wait_for_element', {
      selector: '.toast',
      timeoutMs: 500,
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('browser_dom_wait_for_element')
    expect(result.structuredContent).toMatchObject({
      actionKind: 'browser_dom_wait_for_element',
      repairSuggestion: {
        pattern: 'action_timeout',
        suggestedTool: 'browser_dom_wait_for_element',
      },
      selector: '.toast',
      status: 'error',
    })
  })

  it('rejects browser_dom_trigger_event when the connected extension transport does not support writes', async () => {
    ;(runtime.browserDomBridge.getStatus as any).mockReturnValue({
      connected: true,
      enabled: true,
      host: '127.0.0.1',
      pendingRequests: 0,
      port: 8765,
    })
    ;(runtime.browserDomBridge.supportsAction as any).mockImplementation((action: string) => action !== 'triggerEvent')

    const { invoke, server } = createMockServer()
    registerComputerUseTools({
      enableTestTools: false,
      executeAction: vi.fn(),
      runtime,
      server,
    })

    const result = await invoke('browser_dom_trigger_event', {
      eventName: 'click',
      selector: '#app',
    })

    expect(result.isError).toBe(true)
    expect(result.structuredContent).toMatchObject({
      status: 'unavailable',
      unsupportedActions: ['triggerEvent'],
    })
    expect((runtime.browserDomBridge.triggerEvent as any)).not.toHaveBeenCalled()
  })
})
