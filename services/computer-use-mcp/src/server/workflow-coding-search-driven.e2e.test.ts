import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { ActionInvocation } from '../types'
import type { ExecuteAction } from './action-executor'
import type { ComputerUseServerRuntime } from './runtime'

import { exec as execCallback } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { beforeEach, describe, expect, it } from 'vitest'

import { CodingPrimitives } from '../coding/primitives'
import { RunStateManager } from '../state'
import {
  createDisplayInfo,
  createLocalExecutionTarget,
  createTerminalState,
  createTestConfig,
} from '../test-fixtures'
import { registerComputerUseTools } from './register-tools'

const execAsync = promisify(execCallback)

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

function success(action: ActionInvocation, backendResult: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: `${action.kind} ok` }],
    structuredContent: {
      status: 'executed',
      action: action.kind,
      backendResult,
    },
  }
}

function failure(action: ActionInvocation, message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
    structuredContent: {
      status: 'failed',
      action: action.kind,
      error: message,
    },
  }
}

function createRuntime(): ComputerUseServerRuntime {
  return {
    config: createTestConfig({ approvalMode: 'never' }),
    stateManager: new RunStateManager(),
    session: {
      createPendingAction: () => ({ id: 'approval_1' }),
      getPendingAction: () => undefined,
      listPendingActions: () => [],
      removePendingAction: () => {},
      record: async () => undefined,
      getBudgetState: () => ({ operationsExecuted: 0, operationUnitsConsumed: 0 }),
      getLastScreenshot: () => undefined,
      getSnapshot: () => ({ operationsExecuted: 0, operationUnitsConsumed: 0, pendingActions: [] }),
    },
    executor: {
      getExecutionTarget: async () => createLocalExecutionTarget(),
      getForegroundContext: async () => ({ available: false, platform: 'darwin' as const }),
      getDisplayInfo: async () => createDisplayInfo({ platform: 'darwin' }),
      getPermissionInfo: async () => ({}),
      describe: () => ({ kind: 'dry-run', notes: [] }),
    },
    terminalRunner: {
      getState: () => createTerminalState(),
      describe: () => ({ kind: 'local-shell-runner', notes: [] }),
    },
    browserDomBridge: {
      getStatus: () => ({
        enabled: false,
        connected: false,
        host: '127.0.0.1',
        port: 8765,
        pendingRequests: 0,
      }),
    },
    cdpBridgeManager: {
      probeAvailability: async () => ({
        endpoint: 'http://localhost:9222',
        connected: false,
        connectable: false,
      }),
    },
    taskMemory: {},
  } as unknown as ComputerUseServerRuntime
}

function createFunctionalExecuteAction(runtime: ComputerUseServerRuntime): ExecuteAction {
  return async (action) => {
    const primitives = new CodingPrimitives(runtime)

    try {
      switch (action.kind) {
        case 'coding_review_workspace': {
          const result = await primitives.reviewWorkspace(action.input.workspacePath)
          return success(action, result as Record<string, unknown>)
        }
        case 'coding_search_text': {
          const result = await primitives.searchText(action.input.query, action.input.targetPath, action.input.glob, action.input.limit)
          return success(action, result as Record<string, unknown>)
        }
        case 'coding_search_symbol': {
          const result = await primitives.searchSymbol(action.input.symbolName, action.input.targetPath, action.input.glob, action.input.limit)
          return success(action, result as Record<string, unknown>)
        }
        case 'coding_find_references': {
          const result = await primitives.findReferences(action.input.filePath, action.input.targetLine, action.input.targetColumn, action.input.limit)
          return success(action, result as Record<string, unknown>)
        }
        case 'coding_select_target': {
          const result = await primitives.selectTarget(action.input)
          return success(action, result as unknown as Record<string, unknown>)
        }
        case 'coding_plan_changes': {
          const result = await primitives.planChanges(action.input)
          return success(action, result as unknown as Record<string, unknown>)
        }
        case 'coding_read_file': {
          const content = await primitives.readFile(action.input.filePath, action.input.startLine, action.input.endLine)
          return success(action, { content })
        }
        case 'coding_apply_patch': {
          const summary = await primitives.applyPatch(action.input.filePath, action.input.oldString, action.input.newString)
          return success(action, { summary })
        }
        case 'coding_compress_context': {
          const result = await primitives.compressContext(
            action.input.goal,
            action.input.filesSummary,
            action.input.recentResultSummary,
            action.input.unresolvedIssues,
            action.input.nextStepRecommendation,
          )
          return success(action, result as Record<string, unknown>)
        }
        case 'coding_review_changes': {
          const result = await primitives.reviewChanges(action.input)
          return success(action, result as unknown as Record<string, unknown>)
        }
        case 'coding_report_status': {
          const result = await primitives.reportStatus(
            action.input.status,
            action.input.summary,
            action.input.filesTouched,
            action.input.commandsRun,
            action.input.checks,
            action.input.nextStep,
          )
          return success(action, result as Record<string, unknown>)
        }
        case 'terminal_exec': {
          const stdoutStderr = await execAsync(action.input.command, {
            cwd: action.input.cwd,
            timeout: action.input.timeoutMs,
          })

          const terminalResult = {
            command: action.input.command,
            stdout: stdoutStderr.stdout,
            stderr: stdoutStderr.stderr,
            exitCode: 0,
            effectiveCwd: action.input.cwd || '',
            durationMs: 1,
            timedOut: false,
          }

          runtime.stateManager.updateTerminalResult(terminalResult)
          return success(action, terminalResult)
        }
        default:
          return success(action, {})
      }
    }
    catch (error) {
      return failure(action, error instanceof Error ? error.message : String(error))
    }
  }
}

describe('workflow_coding_loop search-driven e2e', () => {
  let runtime: ComputerUseServerRuntime

  beforeEach(() => {
    runtime = createRuntime()
  })

  it('completes search-driven single-target loop without explicit targetFile', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'airi-coding-loop-single-'))
    await mkdir(join(workspace, 'src'), { recursive: true })
    await writeFile(join(workspace, 'src', 'index.ts'), 'export const flag = false\n', 'utf8')

    const { server, invoke } = createMockServer()
    registerComputerUseTools({
      server,
      runtime,
      executeAction: createFunctionalExecuteAction(runtime),
      enableTestTools: false,
    })

    const result = await invoke('workflow_coding_loop', {
      workspacePath: workspace,
      taskGoal: 'Flip flag',
      searchQuery: 'export const flag = false',
      patchOld: 'export const flag = false',
      patchNew: 'export const flag = true',
      testCommand: 'grep -q "export const flag = true" src/index.ts && echo ok',
      autoApprove: true,
    })

    const structured = result.structuredContent as Record<string, any>
    expect(structured.status).toBe('completed')

    const content = await readFile(join(workspace, 'src', 'index.ts'), 'utf8')
    expect(content).toContain('export const flag = true')
    expect(runtime.stateManager.getState().coding?.lastTargetSelection?.selectedFile).toBe('src/index.ts')

    await rm(workspace, { recursive: true, force: true })
  })

  it('supports deterministic two-file sequential progression via follow-up run', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'airi-coding-loop-dual-'))
    await writeFile(join(workspace, 'a.ts'), 'export const flag = false\n', 'utf8')
    await writeFile(join(workspace, 'b.ts'), 'export const flag = false\n', 'utf8')

    const { server, invoke } = createMockServer()
    registerComputerUseTools({
      server,
      runtime,
      executeAction: createFunctionalExecuteAction(runtime),
      enableTestTools: false,
    })

    const first = await invoke('workflow_coding_loop', {
      workspacePath: workspace,
      taskGoal: 'Flip flag in two files',
      targetFile: 'a.ts',
      searchQuery: 'export const flag = false',
      allowMultiFile: true,
      maxPlannedFiles: 2,
      patchOld: 'export const flag = false',
      patchNew: 'export const flag = true',
      testCommand: 'grep -q "export const flag = true" a.ts && echo ok',
      autoApprove: true,
    })

    const firstStructured = first.structuredContent as Record<string, any>
    expect(firstStructured.status).toBe('completed')

    const firstReport = runtime.stateManager.getState().coding?.lastCodingReport
    expect(firstReport?.status).toBe('in_progress')
    expect(firstReport?.nextStep).toContain('Proceed to next planned file')

    const second = await invoke('workflow_coding_loop', {
      workspacePath: workspace,
      taskGoal: 'Continue second file',
      searchQuery: 'export const flag = false',
      allowMultiFile: true,
      maxPlannedFiles: 2,
      patchOld: 'export const flag = false',
      patchNew: 'export const flag = true',
      testCommand: 'grep -q "export const flag = true" b.ts && echo ok',
      autoApprove: true,
    })

    const secondStructured = second.structuredContent as Record<string, any>
    expect(secondStructured.status).toBe('completed')

    expect(await readFile(join(workspace, 'a.ts'), 'utf8')).toContain('export const flag = true')
    expect(await readFile(join(workspace, 'b.ts'), 'utf8')).toContain('export const flag = true')

    const steps = runtime.stateManager.getState().coding?.currentPlan?.steps || []
    expect(steps.every(step => step.status === 'completed')).toBe(true)
    expect(runtime.stateManager.getState().coding?.lastCodingReport?.status).toBe('completed')

    await rm(workspace, { recursive: true, force: true })
  })
})
