import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { ComputerUseServerRuntime } from './runtime'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RunStateManager } from '../state'
import {
  createDisplayInfo,
  createLocalExecutionTarget,
  createTerminalState,
  createTestConfig,
} from '../test-fixtures'
import { registerChromeSessionTools } from './register-chrome-session'

type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>

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
      tool(name: string, _summaryOrSchema: unknown, schemaOrHandler: unknown, maybeHandler?: ToolHandler) {
        const handler = (maybeHandler ?? schemaOrHandler) as ToolHandler
        handlers.set(name, handler)
      },
    } as unknown as McpServer,
  }
}

describe('registerChromeSessionTools', () => {
  let runtime: ComputerUseServerRuntime
  let pendingActions: Array<Record<string, unknown>>

  beforeEach(() => {
    pendingActions = []

    runtime = {
      browserDomBridge: {
        getStatus: vi.fn(() => ({
          connected: false,
          enabled: false,
        })),
      },
      cdpBridgeManager: {
        ensureBridge: vi.fn(),
        probeAvailability: vi.fn().mockResolvedValue({
          connectable: false,
          connected: false,
          endpoint: undefined,
          lastError: 'CDP unavailable',
        }),
      },
      chromeSessionManager: {
        ensureAgentWindow: vi.fn(),
        getSessionInfo: vi.fn(() => null),
      },
      config: createTestConfig({
        approvalMode: 'never',
        executor: 'macos-local',
      }),
      desktopSessionController: {
        addOwnedWindow: vi.fn(),
        begin: vi.fn(() => ({ id: 'desktop-session-1' })),
        getSession: vi.fn(() => null),
      },
      executor: {
        getDisplayInfo: vi.fn().mockResolvedValue(createDisplayInfo({
          note: 'macOS local display',
          platform: 'darwin',
        })),
        getExecutionTarget: vi.fn().mockResolvedValue(createLocalExecutionTarget({
          hostName: 'macbook-pro',
          sessionTag: 'local-session',
        })),
        getForegroundContext: vi.fn().mockResolvedValue({
          appName: 'Finder',
          available: true,
          platform: 'darwin',
          windowTitle: 'Desktop',
        }),
      },
      session: {
        consumeOperation: vi.fn(),
        createPendingAction: vi.fn((record: Record<string, unknown>) => {
          const pending = {
            ...record,
            createdAt: new Date().toISOString(),
            id: `pending-${pendingActions.length + 1}`,
          }
          pendingActions.push(pending)
          return pending
        }),
        getBudgetState: vi.fn(() => ({ operationsExecuted: 0, operationUnitsConsumed: 0 })),
        getLastScreenshot: vi.fn(() => undefined),
        listPendingActions: vi.fn(() => pendingActions),
        record: vi.fn().mockResolvedValue(undefined),
      },
      stateManager: new RunStateManager(),
      terminalRunner: {
        getState: vi.fn(() => createTerminalState({
          effectiveCwd: '/tmp',
        })),
      },
    } as unknown as ComputerUseServerRuntime
  })

  it('returns approval_required instead of launching Chrome when approvals are enabled', async () => {
    runtime.config = createTestConfig({
      approvalMode: 'all',
      executor: 'macos-local',
    })

    const { invoke, server } = createMockServer()
    registerChromeSessionTools({ runtime, server })

    const result = await invoke('desktop_ensure_chrome', {
      url: 'https://example.com',
    })

    const structured = result.structuredContent as Record<string, any>
    expect(structured.status).toBe('approval_required')
    expect(structured.action).toEqual({
      input: {
        url: 'https://example.com',
      },
      kind: 'desktop_ensure_chrome',
    })
    expect(structured.transparency.intent).toBe('Open an agent Chrome window with CDP support')
    expect(runtime.chromeSessionManager.ensureAgentWindow).not.toHaveBeenCalled()
    expect(runtime.session.createPendingAction).toHaveBeenCalledTimes(1)
    expect(runtime.session.createPendingAction).toHaveBeenCalledWith(expect.objectContaining({
      action: {
        input: {
          url: 'https://example.com',
        },
        kind: 'desktop_ensure_chrome',
      },
    }))
    expect(runtime.session.consumeOperation).not.toHaveBeenCalled()
    expect(runtime.stateManager.getState().pendingApprovalCount).toBe(1)
  })

  it('consumes operation budget and persists chrome session when approvals are disabled', async () => {
    vi.mocked(runtime.chromeSessionManager.ensureAgentWindow).mockResolvedValue({
      agentOwned: true,
      createdAt: new Date().toISOString(),
      initialUrl: 'https://example.com',
      pid: 4242,
      wasAlreadyRunning: false,
      windowId: 'chrome-window-1',
    })

    const { invoke, server } = createMockServer()
    registerChromeSessionTools({ runtime, server })

    const result = await invoke('desktop_ensure_chrome', {
      url: 'https://example.com',
    })

    expect(result.isError).not.toBe(true)
    expect((result.content?.[0] as Record<string, unknown>)?.text).toContain('Chrome session launched')
    expect(runtime.session.consumeOperation).toHaveBeenCalledWith(2)
    expect(runtime.stateManager.getState().chromeSession).toMatchObject({
      pid: 4242,
      windowId: 'chrome-window-1',
    })
    expect(runtime.desktopSessionController.begin).toHaveBeenCalledTimes(1)
    expect(runtime.session.record).toHaveBeenCalledTimes(2)
    expect((runtime.session.record as any).mock.calls[0][0].event).toBe('requested')
    expect((runtime.session.record as any).mock.calls[1][0].event).toBe('executed')
  })

  it('uses focus_app when a chrome session already exists', async () => {
    runtime.config = createTestConfig({
      approvalMode: 'all',
      executor: 'macos-local',
    })
    vi.mocked(runtime.chromeSessionManager.getSessionInfo).mockReturnValue({
      agentOwned: true,
      createdAt: new Date().toISOString(),
      pid: 9999,
      wasAlreadyRunning: false,
      windowId: 'chrome-window-existing',
    })

    const { invoke, server } = createMockServer()
    registerChromeSessionTools({ runtime, server })

    const result = await invoke('desktop_ensure_chrome')

    const structured = result.structuredContent as Record<string, any>
    expect(structured.status).toBe('approval_required')
    expect(structured.action).toEqual({
      input: {},
      kind: 'desktop_ensure_chrome',
    })
    expect(structured.transparency.intent).toBe('Bring the agent Chrome window to the foreground')
    expect(runtime.chromeSessionManager.ensureAgentWindow).not.toHaveBeenCalled()
    expect((runtime.session.record as any).mock.calls[0][0].result.approvalAction).toEqual({
      input: {
        app: 'Google Chrome',
      },
      kind: 'focus_app',
    })
  })
})
