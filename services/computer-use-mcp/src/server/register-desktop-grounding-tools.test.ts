import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { ComputerUseServerRuntime } from './runtime'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDryRunExecutor } from '../executors/dry-run'
import { RunStateManager } from '../state'
import { createTestConfig } from '../test-fixtures'
import { registerDesktopGroundingTools } from './register-desktop-grounding'

const { captureDesktopGroundingMock } = vi.hoisted(() => ({
  captureDesktopGroundingMock: vi.fn(),
}))

vi.mock('../desktop-grounding', async () => {
  const actual = await vi.importActual<typeof import('../desktop-grounding')>('../desktop-grounding')
  return {
    ...actual,
    captureDesktopGrounding: captureDesktopGroundingMock,
  }
})

type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>

function createMockServer() {
  const handlers = new Map<string, ToolHandler>()

  return {
    server: {
      tool(name: string, _summary: string, _schema: unknown, handler: ToolHandler) {
        handlers.set(name, handler)
        return { disable: vi.fn() }
      },
    } as unknown as McpServer,
    toolNames: () => [...handlers.keys()],
    async invoke(name: string, args: Record<string, unknown> = {}) {
      const handler = handlers.get(name)
      if (!handler) {
        throw new Error(`Missing registered tool: ${name}`)
      }

      return await handler(args)
    },
  }
}

function createRuntime() {
  const config = createTestConfig()
  const runtime = {
    config,
    stateManager: new RunStateManager(),
    cdpBridgeManager: {
      getStatus: vi.fn().mockReturnValue({ connected: false }),
      ensureBridge: vi.fn(),
      probeAvailability: vi.fn().mockResolvedValue(undefined),
    },
    terminalRunner: {
      getState: vi.fn().mockReturnValue({}),
    },
    chromeSessionManager: {
      getSessionInfo: vi.fn().mockReturnValue(undefined),
    },
    browserDomBridge: {},
    executor: createDryRunExecutor(config),
    session: {
      setLastScreenshot: vi.fn(),
      getLastScreenshot: vi.fn().mockReturnValue(undefined),
      listPendingActions: vi.fn().mockReturnValue([]),
      getRecentTrace: vi.fn().mockReturnValue([]),
    },
    desktopSessionController: {
      getSession: vi.fn().mockReturnValue(undefined),
      getSessionInfo: vi.fn().mockReturnValue(undefined),
      touch: vi.fn(),
      ensureControlledAppInForeground: vi.fn(),
    },
  } as unknown as ComputerUseServerRuntime

  const executeAction = vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'executed' }],
  })

  return { runtime, executeAction }
}

describe('registerDesktopGroundingTools', () => {
  beforeEach(() => {
    captureDesktopGroundingMock.mockReset()
  })

  it('registers only the stable desktop entrypoints', async () => {
    const { runtime, executeAction } = createRuntime()
    const { server, toolNames, invoke } = createMockServer()

    registerDesktopGroundingTools({ server, runtime, executeAction })

    expect(toolNames()).toEqual(['computer_observe', 'computer_act', 'computer_verify'])
    await expect(invoke('desktop_observe')).rejects.toThrow('Missing registered tool: desktop_observe')
    await expect(invoke('desktop_click_target')).rejects.toThrow('Missing registered tool: desktop_click_target')
  })

  it('routes grounded clicks through computer_act and the action executor', async () => {
    const { runtime, executeAction } = createRuntime()

    const { server, invoke } = createMockServer()

    registerDesktopGroundingTools({ server, runtime, executeAction })

    const result = await invoke('computer_act', {
      action: 'click',
      targetId: 't_0',
      clickCount: 2,
      button: 'right',
    })

    expect(result.isError).not.toBe(true)
    expect(executeAction).toHaveBeenCalledWith({
      kind: 'desktop_click_target',
      input: {
        candidateId: 't_0',
        clickCount: 2,
        button: 'right',
      },
    }, 'computer_act')
  })

  it('returns observe error content when captureDesktopGrounding fails', async () => {
    const { runtime, executeAction } = createRuntime()
    captureDesktopGroundingMock.mockRejectedValueOnce(new Error('observe boom'))

    const { server, invoke } = createMockServer()
    registerDesktopGroundingTools({ server, runtime, executeAction })

    const result = await invoke('computer_observe', {})

    expect(result.isError).toBe(true)
    expect(result.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('observe boom') }),
    ])
  })

  it('stores grounding snapshot and returns image content', async () => {
    const { runtime, executeAction } = createRuntime()
    captureDesktopGroundingMock.mockResolvedValueOnce({
      snapshotId: 'dg_new',
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      windows: [],
      screenshot: {
        dataBase64: 'ZmFrZS1wbmc=',
        mimeType: 'image/png',
        path: '/tmp/shot.png',
        capturedAt: new Date().toISOString(),
        width: 1280,
        height: 720,
        executionTargetMode: 'remote',
        sourceHostName: 'fake-remote',
        sourceDisplayId: ':99',
        sourceSessionTag: 'vm-local-1',
      },
      targetCandidates: [],
      staleFlags: { screenshot: false, ax: false, chromeSemantic: false },
    } as any)

    const { server, invoke } = createMockServer()
    registerDesktopGroundingTools({ server, runtime, executeAction })

    const result = await invoke('computer_observe', {})
    const state = runtime.stateManager.getState()

    expect(state.lastGroundingSnapshot?.screenshot.dataBase64).toBe('ZmFrZS1wbmc=')
    expect(runtime.session.setLastScreenshot).toHaveBeenCalledWith(expect.objectContaining({
      path: '/tmp/shot.png',
      executionTargetMode: 'remote',
      sourceHostName: 'fake-remote',
      sourceDisplayId: ':99',
      sourceSessionTag: 'vm-local-1',
    }))
    expect(result.content).toEqual([
      expect.objectContaining({ type: 'text' }),
      expect.objectContaining({
        type: 'image',
        data: 'ZmFrZS1wbmc=',
        mimeType: 'image/png',
      }),
    ])
  })

  it('does not refocus before computer_observe', async () => {
    const { runtime, executeAction } = createRuntime()
    const { server, invoke } = createMockServer()
    registerDesktopGroundingTools({ server, runtime, executeAction })

    captureDesktopGroundingMock.mockResolvedValueOnce({
      snapshotId: 'dg_bg',
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      windows: [],
      screenshot: {
        dataBase64: '',
        mimeType: 'image/png',
        path: '/tmp/shot.png',
        capturedAt: new Date().toISOString(),
      },
      targetCandidates: [],
      staleFlags: { screenshot: false, ax: false, chromeSemantic: false },
    } as any)

    const result = await invoke('computer_observe', { includeChrome: true })

    expect(result.isError).not.toBe(true)
    expect(runtime.desktopSessionController.ensureControlledAppInForeground).not.toHaveBeenCalled()
    expect(captureDesktopGroundingMock).toHaveBeenCalledOnce()
  })

  it('reports a foreground name match as window state and not task success', async () => {
    const { runtime, executeAction } = createRuntime()
    runtime.executor.getForegroundContext = vi.fn().mockResolvedValue({
      available: true,
      platform: 'linux',
      appName: 'Example',
    })
    const { server, invoke } = createMockServer()
    registerDesktopGroundingTools({ server, runtime, executeAction })

    const result = await invoke('computer_verify', { check: 'foreground_app', expected: 'example' })

    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({
      status: 'window_state_matched',
      businessVerification: {
        status: 'unknown',
        evidenceScope: 'window_state',
        windowState: 'matched',
        executionLink: 'absent',
      },
    })
    expect(result.content[0]).toEqual(expect.objectContaining({
      text: expect.stringContaining('does not prove that a task inside the application is complete'),
    }))
  })

  it('marks a known execution id as a trace match and an unknown id as caller supplied', async () => {
    const { runtime, executeAction } = createRuntime()
    runtime.executor.getForegroundContext = vi.fn().mockResolvedValue({
      available: true,
      platform: 'linux',
      windowTitle: 'Notes',
    })
    runtime.session.getRecentTrace = vi.fn().mockReturnValue([
      { contracts: { execution: { executionId: 'exec-1' } } },
    ])
    const { server, invoke } = createMockServer()
    registerDesktopGroundingTools({ server, runtime, executeAction })

    const found = await invoke('computer_verify', {
      check: 'window_title',
      expected: 'Notes',
      executionId: 'exec-1',
    })
    const missing = await invoke('computer_verify', {
      check: 'window_title',
      expected: 'Other',
      executionId: 'exec-missing',
    })

    expect(found.structuredContent).toMatchObject({
      status: 'window_state_matched',
      businessVerification: {
        status: 'unknown',
        executionLink: 'record_found',
        windowState: 'matched',
      },
    })
    expect(found.content[0]).toEqual(expect.objectContaining({
      text: expect.stringContaining('does not prove that this observation is the post-state'),
    }))
    expect(missing.structuredContent).toMatchObject({
      status: 'window_state_not_matched',
      businessVerification: {
        status: 'unknown',
        executionLink: 'caller_supplied',
        windowState: 'not_matched',
      },
    })
  })

  it('captures a new screenshot and does not read the previous screenshot', async () => {
    const { runtime, executeAction } = createRuntime()
    runtime.session.getLastScreenshot = vi.fn(() => {
      throw new Error('screenshot_ready must not read the previous screenshot')
    })
    runtime.executor.takeScreenshot = vi.fn().mockResolvedValue({
      dataBase64: 'YQ==',
      mimeType: 'image/png',
      path: 'verify-shot.png',
      capturedAt: '2026-01-02T00:00:00.000Z',
      placeholder: false,
      width: 8,
      height: 8,
    })
    const { server, invoke } = createMockServer()
    registerDesktopGroundingTools({ server, runtime, executeAction })

    const result = await invoke('computer_verify', { check: 'screenshot_ready' })

    expect(runtime.executor.takeScreenshot).toHaveBeenCalledWith({ label: 'computer_verify' })
    expect(runtime.session.setLastScreenshot).toHaveBeenCalledWith(expect.objectContaining({
      path: 'verify-shot.png',
      capturedAt: '2026-01-02T00:00:00.000Z',
    }))
    expect(result.structuredContent).toMatchObject({
      status: 'window_state_matched',
      observed: { capturedAt: '2026-01-02T00:00:00.000Z', available: true },
      businessVerification: {
        status: 'unknown',
        evidenceScope: 'window_state',
        windowState: 'matched',
        evidenceRef: 'verify-shot.png',
      },
    })
    expect(result.content[0]).toEqual(expect.objectContaining({
      text: expect.stringContaining('does not prove that the picture is the result of an earlier action'),
    }))
  })
})
