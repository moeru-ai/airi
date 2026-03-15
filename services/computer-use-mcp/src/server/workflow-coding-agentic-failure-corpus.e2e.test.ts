import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { ActionInvocation } from '../types'
import type { ExecuteAction } from './action-executor'
import type { ComputerUseServerRuntime } from './runtime'

import { exec as execCallback, execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

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

type FailureScenario
  = | 'wrong_target'
    | 'missed_dependency'
    | 'baseline_noise'
    | 'validation_timed_out'

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

async function createWorkspaceFixture() {
  const workspace = await mkdtemp(join(tmpdir(), 'airi-coding-agentic-failure-corpus-'))

  await writeFile(
    join(workspace, 'index.ts'),
    'import { companionValue } from \'./companion\'\nexport const flag = false\nexport const keep = companionValue\n',
    'utf8',
  )
  await writeFile(join(workspace, 'companion.ts'), 'export const companionValue = 1\n', 'utf8')

  execFileSync('git', ['init'], { cwd: workspace })
  execFileSync('git', ['config', 'user.email', 'failure-corpus@example.com'], { cwd: workspace })
  execFileSync('git', ['config', 'user.name', 'Failure Corpus Gate'], { cwd: workspace })
  execFileSync('git', ['add', '.'], { cwd: workspace })
  execFileSync('git', ['commit', '-m', 'init fixture'], { cwd: workspace })

  return workspace
}

function buildExecuteAction(runtime: ComputerUseServerRuntime, scenario: FailureScenario): ExecuteAction {
  return async (action) => {
    const primitives = new CodingPrimitives(runtime)

    try {
      switch (action.kind) {
        case 'coding_review_workspace': {
          const result = await primitives.reviewWorkspace(action.input.workspacePath)
          return success(action, result as Record<string, unknown>)
        }
        case 'coding_capture_validation_baseline': {
          if (scenario === 'baseline_noise') {
            runtime.stateManager.updateTerminalResult({
              command: 'pnpm test',
              stdout: '',
              stderr: 'FAIL src/index.test.ts > should stay red',
              exitCode: 1,
              effectiveCwd: action.input.workspacePath || '',
              durationMs: 1,
              timedOut: false,
            })
          }

          const result = await primitives.captureValidationBaseline(action.input)
          return success(action, result as unknown as Record<string, unknown>)
        }
        case 'coding_search_text': {
          const result = await primitives.searchText(action.input.query, action.input.targetPath, action.input.glob, action.input.limit)
          return success(action, result as Record<string, unknown>)
        }
        case 'coding_search_symbol': {
          const result = await primitives.searchSymbol(action.input.symbolName, action.input.targetPath, action.input.glob, action.input.limit)
          return success(action, result as Record<string, unknown>)
        }
        case 'coding_analyze_impact': {
          const result = await primitives.analyzeImpact(action.input)
          return success(action, result as unknown as Record<string, unknown>)
        }
        case 'coding_validate_hypothesis': {
          const result = await primitives.validateHypothesis(action.input)
          return success(action, result as unknown as Record<string, unknown>)
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
        case 'coding_apply_patch': {
          if (scenario === 'wrong_target') {
            const workspacePath = runtime.stateManager.getState().coding?.workspacePath || ''
            await writeFile(
              join(workspacePath, 'companion.ts'),
              '\nexport const wrongTargetMutation = true\n',
              { encoding: 'utf8', flag: 'a' },
            )

            const codingState = runtime.stateManager.getState().coding
            runtime.stateManager.updateCodingState({
              recentEdits: [
                ...(codingState?.recentEdits || []),
                { path: 'companion.ts', summary: 'wrong-target mutation for failure corpus gate' },
              ],
            })

            return success(action, { summary: 'Intentionally mutated companion.ts instead of selected target.' })
          }

          const summary = await primitives.applyPatch(action.input.filePath, action.input.oldString, action.input.newString)
          return success(action, { summary })
        }
        case 'terminal_exec': {
          if (scenario === 'baseline_noise') {
            const terminalResult = {
              command: String(action.input.command),
              stdout: '',
              stderr: 'FAIL src/index.test.ts > should stay red',
              exitCode: 1,
              effectiveCwd: action.input.cwd || '',
              durationMs: 1,
              timedOut: false,
            }
            runtime.stateManager.updateTerminalResult(terminalResult)
            return success(action, terminalResult)
          }

          if (scenario === 'validation_timed_out') {
            const terminalResult = {
              command: String(action.input.command),
              stdout: '',
              stderr: 'command timed out',
              exitCode: 124,
              effectiveCwd: action.input.cwd || '',
              durationMs: Number(action.input.timeoutMs || 60_000),
              timedOut: true,
            }
            runtime.stateManager.updateTerminalResult(terminalResult)
            return success(action, terminalResult)
          }

          const command = String(action.input.command)
          const cwd = action.input.cwd

          try {
            const output = await execAsync(command, {
              cwd,
              timeout: action.input.timeoutMs,
            })
            const terminalResult = {
              command,
              stdout: output.stdout,
              stderr: output.stderr,
              exitCode: 0,
              effectiveCwd: cwd || '',
              durationMs: 1,
              timedOut: false,
            }
            runtime.stateManager.updateTerminalResult(terminalResult)
            return success(action, terminalResult)
          }
          catch (error: any) {
            const terminalResult = {
              command,
              stdout: String(error?.stdout || ''),
              stderr: String(error?.stderr || error?.message || 'terminal error'),
              exitCode: Number.isFinite(error?.code) ? Number(error.code) : 1,
              effectiveCwd: cwd || '',
              durationMs: 1,
              timedOut: Boolean(error?.killed),
            }
            runtime.stateManager.updateTerminalResult(terminalResult)
            return success(action, terminalResult)
          }
        }
        case 'coding_review_changes': {
          const result = await primitives.reviewChanges(action.input)
          return success(action, result as unknown as Record<string, unknown>)
        }
        case 'coding_diagnose_changes': {
          const result = await primitives.diagnoseChanges(action.input)
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
        default:
          return success(action, {})
      }
    }
    catch (error) {
      return failure(action, error instanceof Error ? error.message : String(error))
    }
  }
}

async function runScenario(scenario: FailureScenario) {
  const runtime = createRuntime()
  const workspace = await createWorkspaceFixture()
  const { server, invoke } = createMockServer()

  registerComputerUseTools({
    server,
    runtime,
    executeAction: buildExecuteAction(runtime, scenario),
    enableTestTools: false,
  })

  const scenarioCommand = (() => {
    switch (scenario) {
      case 'wrong_target':
        return 'git checkout -- index.ts && echo patched-file-reverted'
      case 'missed_dependency':
        return 'printf "\\nexport const dependencyTouched = true\\n" >> companion.ts && echo dependency-mutated'
      case 'baseline_noise':
        return 'pnpm test'
      case 'validation_timed_out':
        return 'pnpm test'
    }
  })()

  const workflowResult = await invoke('workflow_coding_agentic_loop', {
    workspacePath: workspace,
    taskGoal: `failure corpus ${scenario}`,
    targetFile: 'index.ts',
    changeIntent: 'behavior_fix',
    allowMultiFile: true,
    maxPlannedFiles: 2,
    patchOld: 'export const flag = false',
    patchNew: 'export const flag = true',
    testCommand: scenarioCommand,
    autoApprove: true,
  })

  return {
    workspace,
    runtime,
    workflowResult,
  }
}

describe('workflow_coding_agentic_loop failure corpus e2e', () => {
  it('classifies wrong_target when patched file is reverted before review', async () => {
    const { workspace, runtime } = await runScenario('wrong_target')

    try {
      const diagnosis = runtime.stateManager.getState().coding?.lastChangeDiagnosis
      expect(diagnosis?.rootCauseType).toBe('wrong_target')
      expect(diagnosis?.nextAction).toBe('amend')
      expect(diagnosis?.shouldAmendPlan).toBe(true)
      expect(Array.isArray(diagnosis?.evidence)).toBe(true)
      expect((diagnosis?.evidence || []).length).toBeGreaterThan(0)
      expect(Array.isArray(diagnosis?.causalHints)).toBe(true)
      expect(diagnosis?.evidenceMatrix).toBeDefined()
      expect(Array.isArray(diagnosis?.evidenceMatrix?.strongestSignals)).toBe(true)
      expect(Array.isArray(diagnosis?.causalLinks)).toBe(true)
      expect(diagnosis?.confidenceBreakdown?.competition?.winner?.rootCauseType).toBe('wrong_target')
      expect(diagnosis?.confidenceBreakdown?.competition?.runnerUp?.rootCauseType).toBe('missed_dependency')
      expect(Array.isArray(diagnosis?.confidenceBreakdown?.competition?.disambiguationSignals)).toBe(true)
      expect((diagnosis?.confidenceBreakdown?.competition?.winnerReason || '').length).toBeGreaterThan(0)
      expect((diagnosis?.confidenceBreakdown?.competition?.runnerUpReason || '').length).toBeGreaterThan(0)
      expect(Array.isArray(diagnosis?.contestedSignals)).toBe(true)
      expect(Array.isArray(diagnosis?.conflictingEvidence)).toBe(true)
      expect(typeof diagnosis?.recommendedRepairWindow?.scope).toBe('string')
      expect(runtime.stateManager.getState().coding?.currentPlanSession?.status).toBe('amended')
    }
    finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it('classifies missed_dependency and amends session with companion file', async () => {
    const { workspace, runtime } = await runScenario('missed_dependency')

    try {
      const codingState = runtime.stateManager.getState().coding
      const diagnosis = codingState?.lastChangeDiagnosis
      const session = codingState?.currentPlanSession

      expect(diagnosis?.rootCauseType).toBe('missed_dependency')
      expect(diagnosis?.nextAction).toBe('amend')
      expect(Array.isArray(diagnosis?.evidence)).toBe(true)
      expect((diagnosis?.evidence || []).length).toBeGreaterThan(0)
      expect(Array.isArray(diagnosis?.causalHints)).toBe(true)
      expect(diagnosis?.evidenceMatrix).toBeDefined()
      expect(Array.isArray(diagnosis?.causalLinks)).toBe(true)
      expect(diagnosis?.confidenceBreakdown?.competition?.winner?.rootCauseType).toBe('missed_dependency')
      expect(['incomplete_change', 'validation_command_mismatch']).toContain(
        diagnosis?.confidenceBreakdown?.competition?.runnerUp?.rootCauseType,
      )
      expect(Array.isArray(diagnosis?.confidenceBreakdown?.competition?.disambiguationSignals)).toBe(true)
      expect((diagnosis?.confidenceBreakdown?.competition?.disambiguationSignals?.length || 0)).toBeGreaterThan(0)
      expect(Array.isArray(diagnosis?.contestedSignals)).toBe(true)
      expect(Array.isArray(diagnosis?.conflictingEvidence)).toBe(true)
      expect(diagnosis?.recommendedRepairWindow?.scope).toBe('dependency_slice')
      expect(session?.status).toBe('amended')
      expect(session?.steps.some(step => step.filePath === 'companion.ts')).toBe(true)
    }
    finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it('classifies baseline_noise when validation failure matches captured baseline command', async () => {
    const { workspace, runtime } = await runScenario('baseline_noise')

    try {
      const codingState = runtime.stateManager.getState().coding
      const review = codingState?.lastChangeReview
      const diagnosis = codingState?.lastChangeDiagnosis

      expect(review?.baselineComparison).toBe('baseline_noise')
      expect(diagnosis?.rootCauseType).toBe('baseline_noise')
      expect(diagnosis?.nextAction).toBe('continue')
      expect(diagnosis?.shouldAmendPlan).toBe(false)
      expect(Array.isArray(diagnosis?.evidence)).toBe(true)
      expect(Array.isArray(diagnosis?.causalHints)).toBe(true)
      expect(diagnosis?.evidenceMatrix).toBeDefined()
      expect(Array.isArray(diagnosis?.causalLinks)).toBe(true)
      expect(diagnosis?.confidenceBreakdown?.competition?.winner?.rootCauseType).toBe('baseline_noise')
      expect(diagnosis?.confidenceBreakdown?.competition?.runnerUp?.rootCauseType).toBe('validation_command_mismatch')
      expect(Array.isArray(diagnosis?.confidenceBreakdown?.competition?.disambiguationSignals)).toBe(true)
      expect((diagnosis?.confidenceBreakdown?.competition?.winnerReason || '').length).toBeGreaterThan(0)
      expect(Array.isArray(diagnosis?.contestedSignals)).toBe(true)
      expect(Array.isArray(diagnosis?.conflictingEvidence)).toBe(true)
      expect(diagnosis?.recommendedRepairWindow?.scope).toBe('plan_window')
    }
    finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it('classifies validation_timed_out as validation_environment_issue and aborts session', async () => {
    const { workspace, runtime } = await runScenario('validation_timed_out')

    try {
      const codingState = runtime.stateManager.getState().coding
      const diagnosis = codingState?.lastChangeDiagnosis

      expect(diagnosis?.rootCauseType).toBe('validation_environment_issue')
      expect(diagnosis?.nextAction).toBe('abort')
      expect(diagnosis?.shouldAbortPlan).toBe(true)
      expect(Array.isArray(diagnosis?.evidence)).toBe(true)
      expect(Array.isArray(diagnosis?.causalHints)).toBe(true)
      expect(diagnosis?.evidenceMatrix).toBeDefined()
      expect(Array.isArray(diagnosis?.causalLinks)).toBe(true)
      expect(diagnosis?.confidenceBreakdown?.competition?.winner).toBeDefined()
      expect(diagnosis?.confidenceBreakdown?.competition?.runnerUp).toBeDefined()
      expect(Array.isArray(diagnosis?.confidenceBreakdown?.competition?.contestedSignals)).toBe(true)
      expect(Array.isArray(diagnosis?.contestedSignals)).toBe(true)
      expect(Array.isArray(diagnosis?.conflictingEvidence)).toBe(true)
      expect(diagnosis?.recommendedRepairWindow?.scope).toBe('workspace')
      expect(codingState?.currentPlanSession?.status).toBe('aborted')
    }
    finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })
})
