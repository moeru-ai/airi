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
    server: {
      tool(name: string, _summaryOrSchema: unknown, schemaOrHandler: unknown, maybeHandler?: ToolHandler) {
        const handler = (maybeHandler ?? schemaOrHandler) as ToolHandler
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

describe('registerChromeSessionTools', () => {
  let runtime: ComputerUseServerRuntime
  let pendingActions: Array<Record<string, unknown>>

  beforeEach(() => {
    pendingActions = []

    runtime = {
      config: createTestConfig({
        executor: 'macos-local',
        approvalMode: 'never',
      }),
      stateManager: new RunStateManager(),
      session: {
        getBudgetState: vi.fn(() => ({ operationsExecuted: 0, operationUnitsConsumed: 0 })),
        getLastScreenshot: vi.fn(() => undefined),
        listPendingActions: vi.fn(() => pendingActions),
        createPendingAction: vi.fn((record: Record<string, unknown>) => {
          const pending = {
            ...record,
            id: `pending-${pendingActions.length + 1}`,
            createdAt: new Date().toISOString(),
          }
          pendingActions.push(pending)
          return pending
        }),
        record: vi.fn().mockResolvedValue(undefined),
        consumeOperation: vi.fn(),
      },
      executor: {
        getExecutionTarget: vi.fn().mockResolvedValue(createLocalExecutionTarget({
          hostName: 'macbook-pro',
          sessionTag: 'local-session',
        })),
        getForegroundContext: vi.fn().mockResolvedValue({
          available: true,
          appName: 'Finder',
          windowTitle: 'Desktop',
          platform: 'darwin',
        }),
        getDisplayInfo: vi.fn().mockResolvedValue(createDisplayInfo({
          platform: 'darwin',
          note: 'macOS local display',
        })),
      },
      terminalRunner: {
        getState: vi.fn(() => createTerminalState({
          effectiveCwd: '/tmp',
        })),
      },
      browserDomBridge: {
        getStatus: vi.fn(() => ({
          enabled: false,
          connected: false,
        })),
      },
      cdpBridgeManager: {
        probeAvailability: vi.fn().mockResolvedValue({
          endpoint: undefined,
          connected: false,
          connectable: false,
          lastError: 'CDP unavailable',
        }),
        ensureBridge: vi.fn(),
      },
      chromeSessionManager: {
        getSessionInfo: vi.fn(() => null),
        ensureAgentWindow: vi.fn(),
      },
      desktopSessionController: {
        getSession: vi.fn(() => null),
        begin: vi.fn(() => ({ id: 'desktop-session-1' })),
        addOwnedWindow: vi.fn(),
      },
    } as unknown as ComputerUseServerRuntime
  })

  it('returns approval_required instead of launching Chrome when approvals are enabled', async () => {
    runtime.config = createTestConfig({
      executor: 'macos-local',
      approvalMode: 'all',
    })

    const { server, invoke } = createMockServer()
    registerChromeSessionTools({ server, runtime })

    const result = await invoke('desktop_ensure_chrome', {
      url: 'https://example.com',
    })

    const structured = result.structuredContent as Record<string, any>
    expect(structured.status).toBe('approval_required')
    expect(structured.action).toEqual({
      kind: 'desktop_ensure_chrome',
      input: {
        url: 'https://example.com',
      },
    })
    expect(structured.transparency.intent).toBe('Open an agent Chrome window with CDP support')
    expect(runtime.chromeSessionManager.ensureAgentWindow).not.toHaveBeenCalled()
    expect(runtime.session.createPendingAction).toHaveBeenCalledTimes(1)
    expect(runtime.session.createPendingAction).toHaveBeenCalledWith(expect.objectContaining({
      action: {
        kind: 'desktop_ensure_chrome',
        input: {
          url: 'https://example.com',
        },
      },
    }))
    expect(runtime.session.consumeOperation).not.toHaveBeenCalled()
    expect(runtime.stateManager.getState().pendingApprovalCount).toBe(1)
  })

  it('consumes operation budget and persists chrome session when approvals are disabled', async () => {
    vi.mocked(runtime.chromeSessionManager.ensureAgentWindow).mockResolvedValue({
      wasAlreadyRunning: false,
      windowId: 'chrome-window-1',
      pid: 4242,
      agentOwned: true,
      initialUrl: 'https://example.com',
      createdAt: new Date().toISOString(),
    })

    const { server, invoke } = createMockServer()
    registerChromeSessionTools({ server, runtime })

    const result = await invoke('desktop_ensure_chrome', {
      url: 'https://example.com',
    })

    expect(result.isError).not.toBe(true)
    expect((result.content?.[0] as Record<string, unknown>)?.text).toContain('Chrome session launched')
    expect(runtime.session.consumeOperation).toHaveBeenCalledWith(2)
    expect(runtime.stateManager.getState().chromeSession).toMatchObject({
      windowId: 'chrome-window-1',
      pid: 4242,
    })
    expect(runtime.desktopSessionController.begin).toHaveBeenCalledTimes(1)
    expect(runtime.session.record).toHaveBeenCalledTimes(2)
    expect((runtime.session.record as any).mock.calls[0][0].event).toBe('requested')
    expect((runtime.session.record as any).mock.calls[1][0].event).toBe('executed')
  })

  it('uses focus_app when a chrome session already exists', async () => {
    runtime.config = createTestConfig({
      executor: 'macos-local',
      approvalMode: 'all',
    })
    vi.mocked(runtime.chromeSessionManager.getSessionInfo).mockReturnValue({
      wasAlreadyRunning: false,
      windowId: 'chrome-window-existing',
      pid: 9999,
      agentOwned: true,
      createdAt: new Date().toISOString(),
    })

    const { server, invoke } = createMockServer()
    registerChromeSessionTools({ server, runtime })

    const result = await invoke('desktop_ensure_chrome')

    const structured = result.structuredContent as Record<string, any>
    expect(structured.status).toBe('approval_required')
    expect(structured.action).toEqual({
      kind: 'desktop_ensure_chrome',
      input: {},
    })
    expect(structured.transparency.intent).toBe('Bring the agent Chrome window to the foreground')
    expect(runtime.chromeSessionManager.ensureAgentWindow).not.toHaveBeenCalled()
    expect((runtime.session.record as any).mock.calls[0][0].result.approvalAction).toEqual({
      kind: 'focus_app',
      input: {
        app: 'Google Chrome',
      },
    })
  })
})
