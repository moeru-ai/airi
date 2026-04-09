import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { CodingChangeRootCauseType, CodingReviewRisk } from '../state'
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
import { createRuntimeCoordinator } from './runtime-coordinator'

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

interface ScriptedTerminalState {
  applyToState?: boolean
  command?: string
  exitCode?: number
  stdout?: string
  stderr?: string
  timedOut?: boolean
}

interface ScriptedReviewState {
  status: 'ready_for_next_file' | 'needs_follow_up' | 'blocked' | 'failed'
  detectedRisks?: CodingReviewRisk[]
  unresolvedIssues?: string[]
  validationCommand?: string
  scopedValidationCommand?: string | null
}

interface ScriptedDiagnosisState {
  nextAction: 'amend' | 'abort' | 'continue'
  rootCauseType?: CodingChangeRootCauseType
  shouldAbortPlan?: boolean
  shouldAmendPlan?: boolean
}

function createGateAwareExecuteAction(
  runtime: ComputerUseServerRuntime,
  options?: {
    terminalSequence?: ScriptedTerminalState[]
    reviewSequence?: ScriptedReviewState[]
    diagnosisSequence?: ScriptedDiagnosisState[]
    onTerminalExec?: (snapshot: {
      index: number
      hasVerificationNudge: boolean
      verificationOutcome?: 'nudged' | 'recheck_required' | 'passed' | 'failed'
    }) => void
  },
) {
  let terminalIndex = 0
  let reviewIndex = 0
  let diagnosisIndex = 0

  return vi.fn(async (action: ActionInvocation) => {
    const now = new Date().toISOString()
    const coding = runtime.stateManager.getState().coding

    if (action.kind === 'coding_review_workspace') {
      runtime.stateManager.updateCodingState({
        workspacePath: action.input.workspacePath,
        gitSummary: 'clean',
      })
      return makeExecutedResult(action)
    }

    if (action.kind === 'coding_capture_validation_baseline') {
      runtime.stateManager.updateCodingState({
        validationBaseline: {
          workspacePath: coding?.workspacePath || '/tmp/project',
          baselineDirtyFiles: [],
          baselineDiffSummary: '',
          baselineFailingChecks: [],
          baselineSkippedValidations: [],
          capturedAt: now,
          workspaceMetadata: {
            gitAvailable: false,
          },
        },
      })
      return makeExecutedResult(action)
    }

    if (action.kind === 'coding_select_target') {
      const selectedFile = typeof action.input.targetFile === 'string' && action.input.targetFile !== 'auto'
        ? action.input.targetFile
        : coding?.lastTargetSelection?.selectedFile || 'src/example.ts'

      runtime.stateManager.updateCodingState({
        lastTargetSelection: {
          status: 'selected',
          selectedFile,
          candidates: [{
            filePath: selectedFile,
            sourceKind: 'explicit',
            sourceLabel: `explicit:${selectedFile}`,
            score: 100,
            matchCount: 1,
            inScopedPath: true,
            recentlyEdited: false,
            recentlyRead: false,
            reasons: ['scripted-test-target'],
          }],
          reason: `selected ${selectedFile}`,
          recommendedNextAction: `edit ${selectedFile}`,
        },
      })

      return makeExecutedResult(action)
    }

    if (action.kind === 'coding_plan_changes') {
      const selectedFile = runtime.stateManager.getState().coding?.lastTargetSelection?.selectedFile || 'src/example.ts'
      runtime.stateManager.updateCodingState({
        currentPlan: {
          maxPlannedFiles: 1,
          diffBaselineFiles: [],
          steps: [{
            filePath: selectedFile,
            intent: 'scripted',
            source: 'target_selection',
            status: 'completed',
            dependsOn: [],
            checkpoint: 'none',
          }],
          reason: 'scripted test plan',
        },
        ...(action.input.sessionAware
          ? {
              currentPlanSession: {
                id: 'session-scripted',
                createdAt: now,
                updatedAt: now,
                status: 'completed',
                amendCount: 0,
                backtrackCount: 0,
                maxAmendCount: 2,
                maxBacktrackCount: 1,
                maxFiles: 1,
                changeIntent: 'behavior_fix',
                steps: [{
                  filePath: selectedFile,
                  intent: 'behavior_fix',
                  source: 'target_selection',
                  status: 'validated',
                  dependsOn: [],
                  checkpoint: 'none',
                }],
                reason: 'scripted test session',
              },
            }
          : {}),
      })
      return makeExecutedResult(action)
    }

    if (action.kind === 'terminal_exec') {
      options?.onTerminalExec?.({
        index: terminalIndex,
        hasVerificationNudge: Boolean(runtime.stateManager.getState().coding?.lastVerificationNudge),
        verificationOutcome: runtime.stateManager.getState().coding?.lastVerificationOutcome?.outcome,
      })

      const terminalState = options?.terminalSequence?.[terminalIndex++]
      if (terminalState?.applyToState !== false) {
        runtime.stateManager.updateTerminalResult({
          command: terminalState?.command || action.input.command,
          stdout: terminalState?.stdout || '',
          stderr: terminalState?.stderr || '',
          exitCode: terminalState?.exitCode ?? 0,
          effectiveCwd: action.input.cwd || '/tmp/project',
          durationMs: 1,
          timedOut: terminalState?.timedOut ?? false,
        })
      }
      return makeExecutedResult(action)
    }

    if (action.kind === 'coding_review_changes') {
      const configured = options?.reviewSequence?.[reviewIndex++] ?? {
        status: 'ready_for_next_file',
        detectedRisks: [],
        unresolvedIssues: [],
      }
      const selectedFile = runtime.stateManager.getState().coding?.lastTargetSelection?.selectedFile || 'src/example.ts'
      const terminalCommand = runtime.stateManager.getState().lastTerminalResult?.command
      const validationCommand = configured.validationCommand ?? terminalCommand

      runtime.stateManager.updateCodingState({
        lastChangeReview: {
          status: configured.status,
          filesReviewed: [selectedFile],
          diffSummary: 'scripted review',
          validationSummary: configured.status === 'ready_for_next_file' ? 'ok' : 'follow-up required',
          validationCommand,
          baselineComparison: 'unknown',
          detectedRisks: configured.detectedRisks || [],
          unresolvedIssues: configured.unresolvedIssues || [],
          recommendedNextAction: configured.status === 'ready_for_next_file' ? 'report completion' : 'follow-up needed',
        },
        lastScopedValidationCommand: configured.scopedValidationCommand === null
          ? undefined
          : {
              command: configured.scopedValidationCommand || validationCommand || `pnpm exec eslint "${selectedFile}"`,
              scope: 'file',
              reason: 'scripted review evidence',
              filePath: selectedFile,
              resolvedAt: now,
            },
      })

      return makeExecutedResult(action)
    }

    if (action.kind === 'coding_diagnose_changes') {
      const configured = options?.diagnosisSequence?.[diagnosisIndex++] ?? {
        nextAction: 'continue',
        rootCauseType: 'baseline_noise',
        shouldAbortPlan: false,
        shouldAmendPlan: false,
      }
      runtime.stateManager.updateCodingState({
        lastChangeDiagnosis: {
          rootCauseType: configured.rootCauseType || 'baseline_noise',
          confidence: 0.8,
          evidence: ['scripted diagnosis'],
          affectedFiles: [runtime.stateManager.getState().coding?.lastTargetSelection?.selectedFile || 'src/example.ts'],
          nextAction: configured.nextAction,
          recommendedAction: `diagnosis:${configured.nextAction}`,
          shouldAmendPlan: configured.shouldAmendPlan ?? configured.nextAction === 'amend',
          shouldAbortPlan: configured.shouldAbortPlan ?? configured.nextAction === 'abort',
        },
      })
      return makeExecutedResult(action)
    }

    if (action.kind === 'coding_report_status') {
      runtime.stateManager.updateCodingState({
        lastCodingReport: {
          status: 'completed',
          summary: 'scripted report',
          filesTouched: ['src/example.ts'],
          commandsRun: runtime.stateManager.getState().lastTerminalResult?.command
            ? [runtime.stateManager.getState().lastTerminalResult!.command]
            : [],
          checks: [],
          nextStep: 'done',
        },
      })
      return makeExecutedResult(action)
    }

    return makeExecutedResult(action)
  })
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
    runtime.coordinator = createRuntimeCoordinator(runtime)
  })

  it('registers workflow_coding_loop as a first-class workflow tool', async () => {
    const executeAction = createGateAwareExecuteAction(runtime)
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
    const executeAction = createGateAwareExecuteAction(runtime)
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
    const executeAction = createGateAwareExecuteAction(runtime)
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

  it('skips coding_find_references until a deterministic target file exists', async () => {
    const executeAction = createGateAwareExecuteAction(runtime)
    const { server, invoke } = createMockServer()

    registerComputerUseTools({
      server,
      runtime,
      executeAction,
      enableTestTools: false,
    })

    const result = await invoke('workflow_coding_loop', {
      workspacePath: '/tmp/project',
      taskGoal: 'Refactor symbol usage without explicit file',
      targetSymbol: 'legacyFn',
      targetLine: 12,
      targetColumn: 7,
      patchOld: 'legacyFn()',
      patchNew: 'modernFn()',
      testCommand: 'pnpm test',
    })

    const structured = result.structuredContent as Record<string, any>
    expect(structured.kind).toBe('workflow_result')
    expect(structured.status).toBe('completed')
    expect(executeAction.mock.calls.map(call => call[0].kind)).not.toContain('coding_find_references')
  })

  it('fails fast when neither targetFile nor search hints are provided', async () => {
    const executeAction = createGateAwareExecuteAction(runtime)
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
    const executeAction = createGateAwareExecuteAction(runtime)
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

  it('uses the captured validation workspace for agentic validation commands', async () => {
    const executeAction = createGateAwareExecuteAction(runtime)
    const { server, invoke } = createMockServer()

    registerComputerUseTools({
      server,
      runtime,
      executeAction,
      enableTestTools: false,
    })

    await invoke('workflow_coding_agentic_loop', {
      workspacePath: '/tmp/project',
      taskGoal: 'Use baseline workspace fallback',
      targetFile: 'src/example.ts',
      patchOld: 'a',
      patchNew: 'b',
      testCommand: 'pnpm test',
      autoApprove: true,
    })

    const terminalExecAction = executeAction.mock.calls.find(call => call[0].kind === 'terminal_exec')?.[0]
    expect(terminalExecAction).toMatchObject({
      kind: 'terminal_exec',
      input: {
        cwd: '/tmp/project',
      },
    })
  })

  it('coding_loop fails when review stays needs_follow_up after single recheck', async () => {
    const executeAction = createGateAwareExecuteAction(runtime, {
      terminalSequence: [
        { applyToState: false },
        { applyToState: true, exitCode: 0 },
      ],
      reviewSequence: [
        {
          status: 'needs_follow_up',
          detectedRisks: ['no_validation_run'],
          unresolvedIssues: [],
          scopedValidationCommand: 'pnpm exec eslint "src/example.ts"',
        },
        {
          status: 'needs_follow_up',
          detectedRisks: ['unresolved_issues_remain'],
          unresolvedIssues: ['still unresolved'],
          scopedValidationCommand: 'pnpm exec eslint "src/example.ts"',
        },
      ],
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
      taskGoal: 'Needs follow-up after recheck',
      targetFile: 'src/example.ts',
      patchOld: 'a',
      patchNew: 'b',
      testCommand: 'auto',
      autoApprove: true,
    })

    const structured = result.structuredContent as Record<string, any>
    expect(structured.status).toBe('failed')
    expect(executeAction.mock.calls.filter(call => call[0].kind === 'terminal_exec')).toHaveLength(2)
    expect(executeAction.mock.calls.filter(call => call[0].kind === 'coding_review_changes')).toHaveLength(2)
  })

  it('coding_loop triggers exactly one bounded recheck for no_validation_run and completes only after pass', async () => {
    const executeAction = createGateAwareExecuteAction(runtime, {
      terminalSequence: [
        { applyToState: false },
        { applyToState: true, exitCode: 0 },
      ],
      reviewSequence: [
        {
          status: 'needs_follow_up',
          detectedRisks: ['no_validation_run'],
          unresolvedIssues: [],
          scopedValidationCommand: 'pnpm exec eslint "src/example.ts"',
        },
        {
          status: 'ready_for_next_file',
          detectedRisks: [],
          unresolvedIssues: [],
          scopedValidationCommand: 'pnpm exec eslint "src/example.ts"',
        },
      ],
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
      taskGoal: 'Trigger bounded recheck once',
      targetFile: 'src/example.ts',
      patchOld: 'a',
      patchNew: 'b',
      testCommand: 'auto',
      autoApprove: true,
    })

    const structured = result.structuredContent as Record<string, any>
    expect(structured.status).toBe('completed')
    expect(executeAction.mock.calls.filter(call => call[0].kind === 'terminal_exec')).toHaveLength(2)
    expect(executeAction.mock.calls.filter(call => call[0].kind === 'coding_review_changes')).toHaveLength(2)
  })

  it('generates verification nudge before bounded recheck execution', async () => {
    const terminalObservations: Array<{
      index: number
      hasVerificationNudge: boolean
      verificationOutcome?: 'nudged' | 'recheck_required' | 'passed' | 'failed'
    }> = []

    const executeAction = createGateAwareExecuteAction(runtime, {
      terminalSequence: [
        { applyToState: false },
        { applyToState: true, exitCode: 0 },
      ],
      reviewSequence: [
        {
          status: 'needs_follow_up',
          detectedRisks: ['no_validation_run'],
          unresolvedIssues: [],
          scopedValidationCommand: 'pnpm exec eslint "src/example.ts"',
        },
        {
          status: 'ready_for_next_file',
          detectedRisks: [],
          unresolvedIssues: [],
          scopedValidationCommand: 'pnpm exec eslint "src/example.ts"',
        },
      ],
      onTerminalExec: snapshot => terminalObservations.push(snapshot),
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
      taskGoal: 'Nudge before bounded recheck',
      targetFile: 'src/example.ts',
      patchOld: 'a',
      patchNew: 'b',
      testCommand: 'auto',
      autoApprove: true,
    })

    expect((result.structuredContent as Record<string, any>).status).toBe('completed')
    expect(terminalObservations).toHaveLength(2)
    expect(terminalObservations[1]?.hasVerificationNudge).toBe(true)
  })

  it('accepts custom validation commands when they target reviewed file', async () => {
    const executeAction = createGateAwareExecuteAction(runtime, {
      reviewSequence: [{
        status: 'ready_for_next_file',
        detectedRisks: [],
        unresolvedIssues: [],
        validationCommand: './scripts/check-one-file.sh src/example.ts',
        scopedValidationCommand: 'pnpm exec eslint "src/example.ts"',
      }],
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
      taskGoal: 'Use repo-specific validation command',
      targetFile: 'src/example.ts',
      patchOld: 'a',
      patchNew: 'b',
      testCommand: './scripts/check-one-file.sh src/example.ts',
      autoApprove: true,
    })

    const structured = result.structuredContent as Record<string, any>
    expect(structured.status).toBe('completed')
    expect(executeAction.mock.calls.filter(call => call[0].kind === 'terminal_exec')).toHaveLength(1)
    expect(runtime.stateManager.getState().coding?.lastVerificationOutcome?.reasonCodes).toContain('gate_pass')
  })

  it('does not let coding_report_status auto override blocking verification nudge', async () => {
    const executeAction = createGateAwareExecuteAction(runtime, {
      terminalSequence: [
        { applyToState: true, command: 'echo noop-validation', exitCode: 0 },
        { applyToState: true, command: 'echo noop-validation', exitCode: 0 },
      ],
      reviewSequence: [
        {
          status: 'ready_for_next_file',
          detectedRisks: [],
          unresolvedIssues: [],
          validationCommand: 'echo noop-validation',
          scopedValidationCommand: 'echo noop-validation',
        },
        {
          status: 'ready_for_next_file',
          detectedRisks: [],
          unresolvedIssues: [],
          validationCommand: 'echo noop-validation',
          scopedValidationCommand: 'echo noop-validation',
        },
      ],
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
      taskGoal: 'Blocking nudge must dominate auto report',
      targetFile: 'src/example.ts',
      patchOld: 'a',
      patchNew: 'b',
      testCommand: 'echo noop-validation',
      autoApprove: true,
    })

    const structured = result.structuredContent as Record<string, any>
    expect(structured.status).toBe('failed')
    expect(executeAction.mock.calls.filter(call => call[0].kind === 'terminal_exec')).toHaveLength(2)
    expect(runtime.stateManager.getState().coding?.lastCodingReport?.status).toBe('completed')
    expect(runtime.stateManager.getState().coding?.lastVerificationOutcome?.outcome).toBe('failed')
    expect(runtime.stateManager.getState().coding?.lastVerificationOutcome?.reasonCodes).toContain('validation_command_mismatch')
  })

  it('coding_loop does not recheck for patch_verification_mismatch and fails directly', async () => {
    const executeAction = createGateAwareExecuteAction(runtime, {
      reviewSequence: [{
        status: 'ready_for_next_file',
        detectedRisks: ['patch_verification_mismatch'],
        unresolvedIssues: [],
      }],
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
      taskGoal: 'Patch mismatch should fail directly',
      targetFile: 'src/example.ts',
      patchOld: 'a',
      patchNew: 'b',
      testCommand: 'pnpm test',
      autoApprove: true,
    })

    const structured = result.structuredContent as Record<string, any>
    expect(structured.status).toBe('failed')
    expect(executeAction.mock.calls.filter(call => call[0].kind === 'terminal_exec')).toHaveLength(1)
    expect(executeAction.mock.calls.filter(call => call[0].kind === 'coding_review_changes')).toHaveLength(1)
  })

  it('coding_agentic_loop fails when diagnosis nextAction is amend', async () => {
    const executeAction = createGateAwareExecuteAction(runtime, {
      diagnosisSequence: [{
        nextAction: 'amend',
        rootCauseType: 'incomplete_change',
      }],
    })
    const { server, invoke } = createMockServer()

    registerComputerUseTools({
      server,
      runtime,
      executeAction,
      enableTestTools: false,
    })

    const result = await invoke('workflow_coding_agentic_loop', {
      workspacePath: '/tmp/project',
      taskGoal: 'Diagnosis amend',
      targetFile: 'src/example.ts',
      patchOld: 'a',
      patchNew: 'b',
      testCommand: 'pnpm test',
      autoApprove: true,
    })

    expect((result.structuredContent as Record<string, any>).status).toBe('failed')
  })

  it('coding_agentic_loop fails when diagnosis nextAction is abort', async () => {
    const executeAction = createGateAwareExecuteAction(runtime, {
      diagnosisSequence: [{
        nextAction: 'abort',
        rootCauseType: 'validation_environment_issue',
      }],
    })
    const { server, invoke } = createMockServer()

    registerComputerUseTools({
      server,
      runtime,
      executeAction,
      enableTestTools: false,
    })

    const result = await invoke('workflow_coding_agentic_loop', {
      workspacePath: '/tmp/project',
      taskGoal: 'Diagnosis abort',
      targetFile: 'src/example.ts',
      patchOld: 'a',
      patchNew: 'b',
      testCommand: 'pnpm test',
      autoApprove: true,
    })

    expect((result.structuredContent as Record<string, any>).status).toBe('failed')
  })

  it('coding_agentic_loop fails when diagnosis says continue but review is still not ready', async () => {
    const executeAction = createGateAwareExecuteAction(runtime, {
      reviewSequence: [{
        status: 'needs_follow_up',
        detectedRisks: ['unresolved_issues_remain'],
        unresolvedIssues: ['risk remains'],
      }],
      diagnosisSequence: [{
        nextAction: 'continue',
        rootCauseType: 'baseline_noise',
      }],
    })
    const { server, invoke } = createMockServer()

    registerComputerUseTools({
      server,
      runtime,
      executeAction,
      enableTestTools: false,
    })

    const result = await invoke('workflow_coding_agentic_loop', {
      workspacePath: '/tmp/project',
      taskGoal: 'Diagnosis continue but review not ready',
      targetFile: 'src/example.ts',
      patchOld: 'a',
      patchNew: 'b',
      testCommand: 'pnpm test',
      autoApprove: true,
    })

    expect((result.structuredContent as Record<string, any>).status).toBe('failed')
  })

  it('coding_agentic_loop bounded recheck runs at most once', async () => {
    const executeAction = createGateAwareExecuteAction(runtime, {
      terminalSequence: [
        { applyToState: false },
        { applyToState: true, command: 'echo still-mismatch', exitCode: 0 },
      ],
      reviewSequence: [
        {
          status: 'needs_follow_up',
          detectedRisks: ['no_validation_run'],
          unresolvedIssues: [],
          scopedValidationCommand: 'pnpm exec eslint "src/example.ts"',
        },
        {
          status: 'needs_follow_up',
          detectedRisks: [],
          unresolvedIssues: [],
          scopedValidationCommand: 'pnpm exec eslint "src/example.ts"',
          validationCommand: 'echo still-mismatch',
        },
      ],
      diagnosisSequence: [
        { nextAction: 'continue', rootCauseType: 'validation_command_mismatch' },
        { nextAction: 'continue', rootCauseType: 'validation_command_mismatch' },
      ],
    })
    const { server, invoke } = createMockServer()

    registerComputerUseTools({
      server,
      runtime,
      executeAction,
      enableTestTools: false,
    })

    const result = await invoke('workflow_coding_agentic_loop', {
      workspacePath: '/tmp/project',
      taskGoal: 'Recheck only once',
      targetFile: 'src/example.ts',
      patchOld: 'a',
      patchNew: 'b',
      testCommand: 'auto',
      autoApprove: true,
    })

    expect((result.structuredContent as Record<string, any>).status).toBe('failed')
    expect(executeAction.mock.calls.filter(call => call[0].kind === 'terminal_exec')).toHaveLength(2)
    expect(executeAction.mock.calls.filter(call => call[0].kind === 'coding_review_changes')).toHaveLength(2)
    expect(executeAction.mock.calls.filter(call => call[0].kind === 'coding_diagnose_changes')).toHaveLength(2)
  })

  it('fails fast for agentic workflow when no target hint exists', async () => {
    const executeAction = createGateAwareExecuteAction(runtime)
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
