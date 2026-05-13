import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { ComputerUseServerRuntime } from './runtime'

import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  const runtime = {
    config: createTestConfig(),
    stateManager: new RunStateManager(),
    cdpBridgeManager: {
      getStatus: vi.fn().mockReturnValue({ connected: false }),
      ensureBridge: vi.fn(),
    },
    chromeSessionManager: {
      getSessionInfo: vi.fn().mockReturnValue(undefined),
    },
    browserDomBridge: {},
    executor: {},
    session: {
      setLastScreenshot: vi.fn(),
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

  it('registers desktop_click_target through the action executor', async () => {
    const { runtime, executeAction } = createRuntime()

    const { server, invoke } = createMockServer()

    registerDesktopGroundingTools({ server, runtime, executeAction })

    const result = await invoke('desktop_click_target', {
      candidateId: 't_0',
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
    }, 'desktop_click_target')
  })

  it('returns observe error content when captureDesktopGrounding fails', async () => {
    const { runtime, executeAction } = createRuntime()
    captureDesktopGroundingMock.mockRejectedValueOnce(new Error('observe boom'))

    const { server, invoke } = createMockServer()
    registerDesktopGroundingTools({ server, runtime, executeAction })

    const result = await invoke('desktop_observe', {})

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

    const result = await invoke('desktop_observe', {})
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

  it('does not refocus before desktop_observe', async () => {
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

    const result = await invoke('desktop_observe', { includeChrome: true })

    expect(result.isError).not.toBe(true)
    expect(runtime.desktopSessionController.ensureControlledAppInForeground).not.toHaveBeenCalled()
    expect(captureDesktopGroundingMock).toHaveBeenCalledOnce()
  })
})
