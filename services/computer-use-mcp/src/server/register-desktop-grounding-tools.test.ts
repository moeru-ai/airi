import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { ComputerUseServerRuntime } from './runtime'

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDryRunExecutor } from '../executors/dry-run'
import { ComputerUseSession } from '../session'
import { RunStateManager } from '../state'
import { createDisplayInfo, createLocalExecutionTarget, createTerminalState, createTestConfig } from '../test-fixtures'
import { createExecuteAction } from './action-executor'
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
    runtime.executor.takeScreenshot = vi.fn().mockResolvedValue(usableScreenshot())
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
    expect(runtime.stateManager.getState().lastScreenshot).toMatchObject({
      path: 'verify-shot.png',
      placeholder: false,
    })
  })

  it('does not replace the last screenshot with an unusable capture', async () => {
    const { runtime, executeAction } = createRuntime()
    runtime.stateManager.updateLastScreenshot({
      path: 'previous.png',
      capturedAt: '2026-01-01T00:00:00.000Z',
      placeholder: false,
    })
    const { server, invoke } = createMockServer()
    registerDesktopGroundingTools({ server, runtime, executeAction })
    const unusable = [
      {
        dataBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pP8WwAAAABJRU5ErkJggg==',
        mimeType: 'image/png',
        path: 'placeholder.png',
        capturedAt: '2026-01-02T00:00:00.000Z',
        placeholder: true,
        width: 1,
        height: 1,
      },
      {
        dataBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pP8WwAAAABJRU5ErkJggg==',
        mimeType: 'image/png',
        path: 'one-pixel.png',
        capturedAt: '2026-01-02T00:00:00.000Z',
        placeholder: false,
        width: 8,
        height: 8,
      },
      {
        dataBase64: '',
        mimeType: 'image/png',
        path: 'empty.png',
        capturedAt: '2026-01-02T00:00:00.000Z',
        placeholder: false,
        width: 8,
        height: 8,
      },
      {
        dataBase64: 'YQ==',
        mimeType: 'image/png',
        path: 'text.png',
        capturedAt: '2026-01-02T00:00:00.000Z',
        placeholder: false,
        width: 8,
        height: 8,
      },
    ]
    for (const screenshot of unusable) {
      runtime.executor.takeScreenshot = vi.fn().mockResolvedValue(screenshot)
      const result = await invoke('computer_verify', { check: 'screenshot_ready' })
      expect(result.structuredContent).toMatchObject({
        status: 'window_state_not_matched',
        businessVerification: {
          status: 'unknown',
          windowState: 'not_matched',
        },
      })
    }
    expect(runtime.session.setLastScreenshot).not.toHaveBeenCalled()
    expect(runtime.stateManager.getState().lastScreenshot).toMatchObject({
      path: 'previous.png',
    })
  })

  // https://github.com/moeru-ai/airi/pull/3577
  // ROOT CAUSE:
  //
  // executeAction stored one execution id on the trace and returned another id.
  // computer_verify searched the trace for the returned id, so a real computer_act was caller_supplied.
  //
  // The outcome record and the tool result now share the contract built for that result.
  it('finds the computer_act execution id in the same session trace', async () => {
    const sessionRoot = await mkdtemp(join(tmpdir(), 'airi-verify-'))
    const config = createTestConfig({
      sessionRoot,
      executor: 'dry-run',
      approvalMode: 'never',
      defaultCaptureAfter: false,
    })
    const session = new ComputerUseSession(config)
    await session.init()
    const runtime = {
      config,
      session,
      stateManager: new RunStateManager(),
      executor: {
        kind: 'dry-run',
        describe: () => ({ kind: 'dry-run', notes: [] }),
        getExecutionTarget: vi.fn().mockResolvedValue(createLocalExecutionTarget()),
        getForegroundContext: vi.fn().mockResolvedValue({
          available: true,
          appName: 'Notes',
          windowTitle: 'Notes',
          platform: 'win32',
        }),
        getDisplayInfo: vi.fn().mockResolvedValue(createDisplayInfo({ platform: 'win32' })),
        getPermissionInfo: vi.fn(),
        observeWindows: vi.fn(),
        takeScreenshot: vi.fn(),
        openApp: vi.fn(),
        focusApp: vi.fn(),
        click: vi.fn(),
        typeText: vi.fn(),
        pressKeys: vi.fn(),
        scroll: vi.fn(),
        wait: vi.fn().mockResolvedValue({ performed: true, backend: 'dry-run', notes: [] }),
      },
      terminalRunner: {
        describe: () => ({ kind: 'local-shell-runner', notes: [] }),
        execute: vi.fn(),
        getState: vi.fn().mockReturnValue(createTerminalState()),
        resetState: vi.fn(),
      },
      browserDomBridge: {
        getStatus: vi.fn().mockReturnValue({
          enabled: false,
          host: '127.0.0.1',
          port: 8765,
          connected: false,
          pendingRequests: 0,
        }),
      },
      cdpBridgeManager: {
        getStatus: vi.fn().mockReturnValue({ connected: false }),
        ensureBridge: vi.fn(),
        probeAvailability: vi.fn().mockResolvedValue(undefined),
      },
      chromeSessionManager: {
        getSessionInfo: vi.fn().mockReturnValue(undefined),
      },
      desktopSessionController: {
        getSession: vi.fn().mockReturnValue(null),
        ensureControlledAppInForeground: vi.fn(),
        touch: vi.fn(),
      },
    } as unknown as ComputerUseServerRuntime
    const { server, invoke } = createMockServer()
    registerDesktopGroundingTools({
      server,
      runtime,
      executeAction: createExecuteAction(runtime),
    })

    const acted = await invoke('computer_act', { action: 'wait', durationMs: 0, captureAfter: false })
    const executionId = executionIdFrom(acted)

    const verified = await invoke('computer_verify', {
      check: 'foreground_app',
      expected: 'Notes',
      executionId,
    })

    expect(executionId).toEqual(expect.any(String))
    expect(verified.structuredContent).toMatchObject({
      status: 'window_state_matched',
      businessVerification: {
        status: 'unknown',
        executionLink: 'record_found',
      },
    })
  })
})

function usableScreenshot() {
  return {
    dataBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEUlEQVR4nGP4z8DwnwGMgRQAH+4D/dJQfRoAAAAASUVORK5CYII=',
    mimeType: 'image/png' as const,
    path: 'verify-shot.png',
    capturedAt: '2026-01-02T00:00:00.000Z',
    placeholder: false,
    width: 2,
    height: 2,
  }
}

function executionIdFrom(result: CallToolResult) {
  const structured = result.structuredContent
  if (!structured || typeof structured !== 'object' || !('execution' in structured))
    return undefined
  const execution = structured.execution
  if (!execution || typeof execution !== 'object' || !('executionId' in execution))
    return undefined
  return typeof execution.executionId === 'string' ? execution.executionId : undefined
}
