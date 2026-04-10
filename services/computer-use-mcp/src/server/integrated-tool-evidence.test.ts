import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { ComputerUseServerRuntime } from './runtime'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RunStateManager } from '../state'
import { createDisplayInfo, createLocalExecutionTarget, createTestConfig } from '../test-fixtures'
import { registerComputerUseTools } from './register-tools'

type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>

function createMockServer() {
  const handlers = new Map<string, ToolHandler>()

  return {
    server: {
      tool(...args: unknown[]) {
        const name = args[0] as string
        const handler = args.at(-1) as ToolHandler
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

describe('Integrated Tool Evidence Capture', () => {
  let runtime: ComputerUseServerRuntime

  beforeEach(() => {
    runtime = {
      config: createTestConfig({ approvalMode: 'never' }),
      stateManager: new RunStateManager(),
      session: {
        record: vi.fn().mockResolvedValue(undefined),
        listPendingActions: vi.fn(() => []),
        getBudgetState: vi.fn(() => ({ operationsExecuted: 0, operationUnitsConsumed: 0 })),
        setPointerPosition: vi.fn(),
      },
      executor: {
        getExecutionTarget: vi.fn().mockResolvedValue(createLocalExecutionTarget()),
        getForegroundContext: vi.fn().mockResolvedValue({ available: true, appName: 'Finder', platform: 'darwin' }),
        getDisplayInfo: vi.fn().mockResolvedValue(createDisplayInfo({ platform: 'darwin' })),
      },
      browserDomBridge: {
        getStatus: vi.fn(() => ({
          enabled: true,
          connected: true,
          host: '127.0.0.1',
          port: 8765,
          pendingRequests: 0,
        })),
        clickSelector: vi.fn().mockResolvedValue({
          targetFrameId: 0,
          targetPoint: { x: 100, y: 100 },
        }),
        setInputValue: vi.fn().mockResolvedValue([{
          frameId: 0,
          success: true,
          result: { success: true },
        }]),
      },
    } as unknown as ComputerUseServerRuntime
  })

  it('captures click evidence for browser_dom_click', async () => {
    const { server, invoke } = createMockServer()
    registerComputerUseTools({ server, runtime, executeAction: vi.fn(), enableTestTools: false })

    const result = await invoke('browser_dom_click', {
      selector: '#submit-button',
    })

    expect(result.isError).not.toBe(true)
    const state = runtime.stateManager.getState()
    expect(state.lastVerificationEvidence).toHaveLength(1)
    expect(state.lastVerificationEvidence![0]).toMatchObject({
      source: 'browser_dom_click',
      actionKind: 'browser_dom_click',
      subject: '#submit-button',
      observed: {
        selector: '#submit-button',
        targetFrameId: 0,
      },
    })
    expect(state.lastVerificationEvidenceSummary).toContain('Foreground checked after browser click')
  })

  it('manages handoff lifecycle and evidence for workflow_switch_lane', async () => {
    const { server, invoke } = createMockServer()
    registerComputerUseTools({ server, runtime, executeAction: vi.fn(), enableTestTools: false })

    // 1. Initiation
    const initResult = await invoke('workflow_switch_lane', {
      sourceLane: 'coding',
      targetLane: 'browser',
      reason: 'validate_visual_state',
      constraints: [{
        description: 'should see dashboard window',
        required: true,
        expectedValue: 'Dashboard',
      }],
    })

    expect(initResult.isError).not.toBe(true)
    const stateAfterInit = runtime.stateManager.getState()
    expect(stateAfterInit.activeHandoffContract).toBeDefined()
    expect(stateAfterInit.activeHandoffContract?.targetLane).toBe('browser')
    expect(stateAfterInit.activeHandoffContract?.status).toBe('active')

    const handoffId = (initResult.structuredContent as any).handoffId

    // 2. Return (Return to coding)
    // The tool reads observation facts from the current RunState
    runtime.stateManager.updateRunState({
      activeApp: 'Google Chrome',
      activeWindowTitle: 'Dashboard',
    })

    const returnResult = await invoke('workflow_switch_lane', {
      sourceLane: 'browser',
      targetLane: 'coding',
      handoffId,
      reason: 'return_evidence',
      constraints: [{
        description: 'placeholder constraint',
        required: false,
      }],
    })

    expect(returnResult.isError).not.toBe(true)
    const stateAfterReturn = runtime.stateManager.getState()
    expect(stateAfterReturn.activeHandoffContract).toBeUndefined()
    expect(stateAfterReturn.handoffHistory).toHaveLength(1)
    
    const resolved = stateAfterReturn.handoffHistory[0]
    expect(resolved.status).toBe('fulfilled')
    // Evidence for constraint 0 should NOT be the "Missing" placeholder
    expect(resolved.evidence?.[0]).not.toContain('Missing required evidence')
  })

  it('captures interaction evidence for browser_dom_set_input_value', async () => {
    const { server, invoke } = createMockServer()
    registerComputerUseTools({ server, runtime, executeAction: vi.fn(), enableTestTools: false })

    const result = await invoke('browser_dom_set_input_value', {
      selector: '#username',
      value: 'antigravity',
    })

    expect(result.isError).not.toBe(true)
    const state = runtime.stateManager.getState()
    expect(state.lastVerificationEvidence).toHaveLength(1)
    expect(state.lastVerificationEvidence![0]).toMatchObject({
      source: 'browser_dom_set_input_value',
      actionKind: 'browser_dom_set_input_value',
      subject: '#username',
      observed: {
        selector: '#username',
        valueLength: 11,
      },
    })
    expect(state.lastVerificationEvidenceSummary).toContain('Set input value for "#username"')
  })
})
