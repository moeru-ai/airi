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
    async invoke(name: string, args: Record<string, unknown> = {}) {
      const handler = handlers.get(name)
      if (!handler) {
        throw new Error(`Missing registered tool: ${name}`)
      }

      return await handler(args)
    },
    server: {
      tool(name: string, _summary: string, _schema: unknown, handler: ToolHandler) {
        handlers.set(name, handler)
        return { disable: vi.fn() }
      },
    } as unknown as McpServer,
  }
}

function createRuntime() {
  const runtime = {
    browserDomBridge: {},
    cdpBridgeManager: {
      ensureBridge: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ connected: false }),
    },
    chromeSessionManager: {
      getSessionInfo: vi.fn().mockReturnValue(undefined),
    },
    config: createTestConfig(),
    desktopSessionController: {
      ensureControlledAppInForeground: vi.fn(),
      getSession: vi.fn().mockReturnValue(undefined),
      getSessionInfo: vi.fn().mockReturnValue(undefined),
      touch: vi.fn(),
    },
    executor: {},
    session: {
      setLastScreenshot: vi.fn(),
    },
    stateManager: new RunStateManager(),
  } as unknown as ComputerUseServerRuntime

  const executeAction = vi.fn().mockResolvedValue({
    content: [{ text: 'executed', type: 'text' }],
  })

  return { executeAction, runtime }
}

describe('registerDesktopGroundingTools', () => {
  beforeEach(() => {
    captureDesktopGroundingMock.mockReset()
  })

  it('registers desktop_click_target through the action executor', async () => {
    const { executeAction, runtime } = createRuntime()

    const { invoke, server } = createMockServer()

    registerDesktopGroundingTools({ executeAction, runtime, server })

    const result = await invoke('desktop_click_target', {
      button: 'right',
      candidateId: 't_0',
      clickCount: 2,
    })

    expect(result.isError).not.toBe(true)
    expect(executeAction).toHaveBeenCalledWith({
      input: {
        button: 'right',
        candidateId: 't_0',
        clickCount: 2,
      },
      kind: 'desktop_click_target',
    }, 'desktop_click_target')
  })

  it('returns observe error content when captureDesktopGrounding fails', async () => {
    const { executeAction, runtime } = createRuntime()
    captureDesktopGroundingMock.mockRejectedValueOnce(new Error('observe boom'))

    const { invoke, server } = createMockServer()
    registerDesktopGroundingTools({ executeAction, runtime, server })

    const result = await invoke('desktop_observe', {})

    expect(result.isError).toBe(true)
    expect(result.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('observe boom') }),
    ])
  })

  it('stores grounding snapshot and returns image content', async () => {
    const { executeAction, runtime } = createRuntime()
    captureDesktopGroundingMock.mockResolvedValueOnce({
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      screenshot: {
        capturedAt: new Date().toISOString(),
        dataBase64: 'ZmFrZS1wbmc=',
        executionTargetMode: 'remote',
        height: 720,
        mimeType: 'image/png',
        path: '/tmp/shot.png',
        sourceDisplayId: ':99',
        sourceHostName: 'fake-remote',
        sourceSessionTag: 'vm-local-1',
        width: 1280,
      },
      snapshotId: 'dg_new',
      staleFlags: { ax: false, chromeSemantic: false, screenshot: false },
      targetCandidates: [],
      windows: [],
    } as any)

    const { invoke, server } = createMockServer()
    registerDesktopGroundingTools({ executeAction, runtime, server })

    const result = await invoke('desktop_observe', {})
    const state = runtime.stateManager.getState()

    expect(state.lastGroundingSnapshot?.screenshot.dataBase64).toBe('ZmFrZS1wbmc=')
    expect(runtime.session.setLastScreenshot).toHaveBeenCalledWith(expect.objectContaining({
      executionTargetMode: 'remote',
      path: '/tmp/shot.png',
      sourceDisplayId: ':99',
      sourceHostName: 'fake-remote',
      sourceSessionTag: 'vm-local-1',
    }))
    expect(result.content).toEqual([
      expect.objectContaining({ type: 'text' }),
      expect.objectContaining({
        data: 'ZmFrZS1wbmc=',
        mimeType: 'image/png',
        type: 'image',
      }),
    ])
  })

  it('does not refocus before desktop_observe', async () => {
    const { executeAction, runtime } = createRuntime()
    const { invoke, server } = createMockServer()
    registerDesktopGroundingTools({ executeAction, runtime, server })

    captureDesktopGroundingMock.mockResolvedValueOnce({
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      screenshot: {
        capturedAt: new Date().toISOString(),
        dataBase64: '',
        mimeType: 'image/png',
        path: '/tmp/shot.png',
      },
      snapshotId: 'dg_bg',
      staleFlags: { ax: false, chromeSemantic: false, screenshot: false },
      targetCandidates: [],
      windows: [],
    } as any)

    const result = await invoke('desktop_observe', { includeChrome: true })

    expect(result.isError).not.toBe(true)
    expect(runtime.desktopSessionController.ensureControlledAppInForeground).not.toHaveBeenCalled()
    expect(captureDesktopGroundingMock).toHaveBeenCalledOnce()
  })
})
