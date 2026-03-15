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
    expect(structured.stepResults).toHaveLength(10)

    expect(executeAction).toHaveBeenCalled()
    expect(executeAction.mock.calls.map(call => call[0].kind)).toEqual([
      'coding_review_workspace',
      'coding_select_target',
      'coding_plan_changes',
      'coding_read_file',
      'coding_compress_context',
      'coding_apply_patch',
      'coding_read_file',
      'terminal_exec',
      'coding_review_changes',
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

  it('executes coding search/reference branch when search params are provided', async () => {
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
      taskGoal: 'Refactor symbol usage',
      targetFile: 'src/example.ts',
      searchQuery: 'oldSymbol',
      targetSymbol: 'oldSymbol',
      targetLine: 12,
      targetColumn: 7,
      patchOld: 'oldSymbol()',
      patchNew: 'newSymbol()',
      testCommand: 'pnpm test',
    })

    const structured = result.structuredContent as Record<string, any>
    expect(structured.kind).toBe('workflow_result')
    expect(structured.status).toBe('completed')
    expect(structured.workflow).toBe('coding_execution_loop')
    expect(structured.stepResults).toHaveLength(13)

    expect(executeAction.mock.calls.map(call => call[0].kind)).toEqual([
      'coding_review_workspace',
      'coding_search_text',
      'coding_search_symbol',
      'coding_find_references',
      'coding_select_target',
      'coding_plan_changes',
      'coding_read_file',
      'coding_compress_context',
      'coding_apply_patch',
      'coding_read_file',
      'terminal_exec',
      'coding_review_changes',
      'coding_report_status',
    ])
  })

  it('supports search-driven auto target mode when targetFile is omitted', async () => {
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
      taskGoal: 'Refactor usage',
      searchQuery: 'legacyFn',
      patchOld: 'legacyFn()',
      patchNew: 'modernFn()',
      testCommand: 'pnpm test',
    })

    const structured = result.structuredContent as Record<string, any>
    expect(structured.kind).toBe('workflow_result')
    expect(structured.status).toBe('completed')
    expect(structured.workflow).toBe('coding_execution_loop')
    expect(structured.stepResults).toHaveLength(11)

    const readAction = executeAction.mock.calls.find(call => call[0].kind === 'coding_read_file')?.[0]
    const patchAction = executeAction.mock.calls.find(call => call[0].kind === 'coding_apply_patch')?.[0]
    expect(readAction).toMatchObject({
      kind: 'coding_read_file',
      input: {
        filePath: 'auto',
      },
    })
    expect(patchAction).toMatchObject({
      kind: 'coding_apply_patch',
      input: {
        filePath: 'auto',
      },
    })
  })

  it('fails fast when neither targetFile nor search hints are provided', async () => {
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
      taskGoal: 'No target hints',
      patchOld: 'a',
      patchNew: 'b',
    })

    expect(result.isError).toBe(true)
    expect(result.structuredContent).toMatchObject({
      status: 'error',
      reason: 'missing_target_file_and_search_hints',
    })
    expect(executeAction).not.toHaveBeenCalled()
  })

  it('returns follow-up workflow failure when current-file review is not ready', async () => {
    const executeAction = vi.fn(async (action: ActionInvocation) => {
      if (action.kind === 'coding_review_changes') {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: 'coding review requires follow-up' }],
          structuredContent: {
            status: 'failed',
            action: 'coding_review_changes',
          },
        }
      }

      return makeExecutedResult(action)
    })

    const { server, invoke } = createMockServer()
    registerComputerUseTools({
      server,
      runtime,
      executeAction,
      enableTestTools: false,
    })

    const result = await invoke('workflow_coding_loop', {
      workspacePath: '/tmp/project',
      taskGoal: 'Needs follow-up',
      targetFile: 'src/example.ts',
      patchOld: 'a',
      patchNew: 'b',
      testCommand: 'pnpm test',
    })

    const structured = result.structuredContent as Record<string, any>
    expect(structured.kind).toBe('workflow_result')
    expect(structured.status).toBe('failed')
    expect(executeAction.mock.calls.map(call => call[0].kind)).toContain('coding_report_status')
  })

  it('registers workflow_coding_agentic_loop and executes agentic coding steps', async () => {
    const executeAction = vi.fn(async (action: ActionInvocation) => makeExecutedResult(action))
    const { server, invoke } = createMockServer()

    registerComputerUseTools({
      server,
      runtime,
      executeAction,
      enableTestTools: false,
    })

    const result = await invoke('workflow_coding_agentic_loop', {
      workspacePath: '/tmp/project',
      taskGoal: 'Fix behavior with agentic loop',
      searchQuery: 'legacyFlag',
      targetSymbol: 'legacyFlag',
      patchOld: 'legacyFlag = false',
      patchNew: 'legacyFlag = true',
      testCommand: 'pnpm test',
      autoApprove: true,
    })

    const structured = result.structuredContent as Record<string, any>
    expect(structured.kind).toBe('workflow_result')
    expect(structured.status).toBe('completed')
    expect(structured.workflow).toBe('coding_agentic_loop')

    expect(executeAction.mock.calls.map(call => call[0].kind)).toEqual([
      'coding_review_workspace',
      'coding_capture_validation_baseline',
      'coding_search_text',
      'coding_search_symbol',
      'coding_analyze_impact',
      'coding_validate_hypothesis',
      'coding_select_target',
      'coding_plan_changes',
      'coding_select_target',
      'coding_read_file',
      'coding_compress_context',
      'coding_apply_patch',
      'coding_read_file',
      'terminal_exec',
      'coding_review_changes',
      'coding_diagnose_changes',
      'coding_report_status',
    ])

    const selectTargetCalls = executeAction.mock.calls
      .map(call => call[0])
      .filter(action => action.kind === 'coding_select_target')

    expect(selectTargetCalls).toHaveLength(2)
    expect(selectTargetCalls[0]).toMatchObject({
      kind: 'coding_select_target',
      input: {
        searchQuery: 'legacyFlag',
        targetSymbol: 'legacyFlag',
      },
    })
    expect(selectTargetCalls[1]).toMatchObject({
      kind: 'coding_select_target',
      input: {
        changeIntent: 'behavior_fix',
      },
    })
  })

  it('fails fast for agentic workflow when no target hint exists', async () => {
    const executeAction = vi.fn(async (action: ActionInvocation) => makeExecutedResult(action))
    const { server, invoke } = createMockServer()

    registerComputerUseTools({
      server,
      runtime,
      executeAction,
      enableTestTools: false,
    })

    const result = await invoke('workflow_coding_agentic_loop', {
      workspacePath: '/tmp/project',
      taskGoal: 'No target hints',
      patchOld: 'a',
      patchNew: 'b',
    })

    expect(result.isError).toBe(true)
    expect(result.structuredContent).toMatchObject({
      status: 'error',
      reason: 'missing_target_file_and_search_hints',
    })
    expect(executeAction).not.toHaveBeenCalled()
  })
})
