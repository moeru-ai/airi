import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { ActionInvocation } from '../types'
import type { ComputerUseServerRuntime } from './runtime'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RunStateManager } from '../state'
import {
  createDisplayInfo,
  createLocalExecutionTarget,
  createTerminalState,
  createTestConfig,
} from '../test-fixtures'
import { registerComputerUseTools } from './register-tools'

type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>

function createMockServer() {
  const handlers = new Map<string, ToolHandler>()

  return {
    server: {
      tool(...args: unknown[]) {
        const name = args[0] as string
        const handler = args[args.length - 1] as ToolHandler
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

function makeExecutedResult(action: ActionInvocation): CallToolResult {
  return {
    content: [{ type: 'text', text: `${action.kind} ok` }],
    structuredContent: {
      status: 'executed',
      action: action.kind,
      backendResult: {},
    },
  }
}

describe('registerComputerUseTools: workflow_coding_loop', () => {
  let runtime: ComputerUseServerRuntime

  beforeEach(() => {
    runtime = {
      config: createTestConfig({ approvalMode: 'never' }),
      stateManager: new RunStateManager(),
      session: {
        createPendingAction: vi.fn(),
        getPendingAction: vi.fn(),
        listPendingActions: vi.fn(() => []),
        removePendingAction: vi.fn(),
        record: vi.fn().mockResolvedValue(undefined),
        getBudgetState: vi.fn(() => ({ operationsExecuted: 0, operationUnitsConsumed: 0 })),
        getLastScreenshot: vi.fn(() => undefined),
        getSnapshot: vi.fn(() => ({ operationsExecuted: 0, operationUnitsConsumed: 0, pendingActions: [] })),
      },
      executor: {
        getExecutionTarget: vi.fn().mockResolvedValue(createLocalExecutionTarget()),
        getForegroundContext: vi.fn().mockResolvedValue({ available: false, platform: 'darwin' }),
        getDisplayInfo: vi.fn().mockResolvedValue(createDisplayInfo({ platform: 'darwin' })),
        getPermissionInfo: vi.fn().mockResolvedValue({}),
        describe: vi.fn(() => ({ kind: 'dry-run', notes: [] })),
      },
      terminalRunner: {
        getState: vi.fn(() => createTerminalState()),
        describe: vi.fn(() => ({ kind: 'local-shell-runner', notes: [] })),
      },
      browserDomBridge: {
        getStatus: vi.fn(() => ({
          enabled: false,
          connected: false,
          host: '127.0.0.1',
          port: 8765,
          pendingRequests: 0,
        })),
      },
      cdpBridgeManager: {
        probeAvailability: vi.fn().mockResolvedValue({
          endpoint: 'http://localhost:9222',
          connected: false,
          connectable: false,
        }),
      },
      taskMemory: {},
    } as unknown as ComputerUseServerRuntime
  })

  it('registers workflow_coding_loop as a first-class workflow tool', async () => {
    const executeAction = vi.fn(async (action: ActionInvocation) => makeExecutedResult(action))
    const { server, invoke } = createMockServer()

    registerComputerUseTools({
      server,
      runtime,
      executeAction,
      enableTestTools: false,
    })

    const result = await invoke('workflow_coding_loop', {
      workspacePath: '/tmp/project',
      taskGoal: 'Adjust a condition',
      targetFile: 'src/example.ts',
      patchOld: 'if (a)',
      patchNew: 'if (b)',
      testCommand: 'pnpm test',
    })

    const structured = result.structuredContent as Record<string, any>
    expect(structured.kind).toBe('workflow_result')
    expect(structured.status).toBe('completed')
    expect(structured.workflow).toBe('coding_execution_loop')
    expect(structured.stepResults).toHaveLength(8)

    expect(executeAction).toHaveBeenCalled()
    expect(executeAction.mock.calls.map(call => call[0].kind)).toEqual([
      'coding_review_workspace',
      'coding_read_file',
      'coding_compress_context',
      'coding_apply_patch',
      'coding_read_file',
      'terminal_exec',
      'coding_review_workspace',
      'coding_report_status',
    ])

    const reportAction = executeAction.mock.calls.find(call => call[0].kind === 'coding_report_status')?.[0]
    expect(reportAction).toMatchObject({
      kind: 'coding_report_status',
      input: {
        status: 'auto',
        summary: 'auto',
        filesTouched: ['auto'],
        commandsRun: ['auto'],
        checks: ['auto'],
        nextStep: 'auto',
      },
    })
  })
})
