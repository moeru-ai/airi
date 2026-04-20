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
    browserDomBridge: {},
    executor: {},
  } as unknown as ComputerUseServerRuntime
}

describe('registerDesktopGroundingTools', () => {
  beforeEach(() => {
    captureDesktopGroundingMock.mockReset()
  })

  it('routes desktop_click_target through executeAction instead of calling the executor directly', async () => {
    const runtime = createRuntime()
    const executeAction = vi.fn().mockResolvedValue({
      structuredContent: { status: 'approval_required' },
      content: [{ type: 'text', text: 'approval required' }],
    })
    const { server, invoke } = createMockServer()

    registerDesktopGroundingTools({ server, runtime, executeAction })

    const result = await invoke('desktop_click_target', {
      candidateId: 't_0',
      clickCount: 2,
      button: 'right',
    })

    expect(executeAction).toHaveBeenCalledWith({
      kind: 'desktop_click_target',
      input: {
        candidateId: 't_0',
        clickCount: 2,
        button: 'right',
      },
    }, 'desktop_click_target')
    expect(result).toMatchObject({
      structuredContent: { status: 'approval_required' },
    })
  })

  it('clears stale grounding state when desktop_observe fails', async () => {
    const runtime = createRuntime()
    runtime.stateManager.updateGroundingSnapshot({
      snapshotId: 'dg_old',
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      windows: [],
      screenshot: { dataBase64: '', mimeType: 'image/png', path: '', capturedAt: new Date().toISOString() },
      targetCandidates: [],
      staleFlags: { screenshot: false, ax: false, chromeSemantic: false },
    } as any)
    captureDesktopGroundingMock.mockRejectedValueOnce(new Error('observe boom'))

    const { server, invoke } = createMockServer()

    registerDesktopGroundingTools({
      server,
      runtime,
      executeAction: vi.fn(),
    })

    const result = await invoke('desktop_observe', {})

    expect(result.isError).toBe(true)
    expect(runtime.stateManager.getState().lastGroundingSnapshot).toBeUndefined()
    expect(runtime.stateManager.getState().lastPointerIntent).toBeUndefined()
    expect(runtime.stateManager.getState().lastClickedCandidateId).toBeUndefined()
  })
})
