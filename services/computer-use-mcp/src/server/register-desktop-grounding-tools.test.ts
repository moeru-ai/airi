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
  return {
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
    desktopSessionController: {
      getSession: vi.fn().mockReturnValue(undefined),
      getSessionInfo: vi.fn().mockReturnValue(undefined),
      touch: vi.fn(),
      ensureControlledAppInForeground: vi.fn(),
    },
  } as unknown as ComputerUseServerRuntime
}

describe('registerDesktopGroundingTools', () => {
  beforeEach(() => {
    captureDesktopGroundingMock.mockReset()
  })

  it('registers desktop_click_target and handles missing candidate gracefully', async () => {
    const runtime = createRuntime()

    const { server, invoke } = createMockServer()

    registerDesktopGroundingTools({ server, runtime })

    runtime.stateManager.updateGroundingSnapshot({
      snapshotId: 'dg_1',
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      windows: [],
      screenshot: { dataBase64: '', mimeType: 'image/png', path: '', capturedAt: new Date().toISOString() },
      targetCandidates: [],
      staleFlags: { screenshot: false, ax: false, chromeSemantic: false },
    } as any)

    const result = await invoke('desktop_click_target', {
      candidateId: 't_missing',
    })

    expect(result.isError).toBe(true)
    expect(result.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('Candidate "t_missing" not found in snapshot') }),
    ])
  })

  it('returns observe error content when captureDesktopGrounding fails', async () => {
    const runtime = createRuntime()
    captureDesktopGroundingMock.mockRejectedValueOnce(new Error('observe boom'))

    const { server, invoke } = createMockServer()
    registerDesktopGroundingTools({ server, runtime })

    const result = await invoke('desktop_observe', {})

    expect(result.isError).toBe(true)
    expect(result.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('observe boom') }),
    ])
  })

  it('stores grounding snapshot and returns image content', async () => {
    const runtime = createRuntime()
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
      },
      targetCandidates: [],
      staleFlags: { screenshot: false, ax: false, chromeSemantic: false },
    } as any)

    const { server, invoke } = createMockServer()
    registerDesktopGroundingTools({ server, runtime })

    const result = await invoke('desktop_observe', {})
    const state = runtime.stateManager.getState()

    expect(state.lastGroundingSnapshot?.screenshot.dataBase64).toBe('ZmFrZS1wbmc=')
    expect(result.content).toEqual([
      expect.objectContaining({ type: 'text' }),
      expect.objectContaining({
        type: 'image',
        data: 'ZmFrZS1wbmc=',
        mimeType: 'image/png',
      }),
    ])
  })
})
