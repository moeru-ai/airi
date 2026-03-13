import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { ExecuteAction } from './server/action-executor'
import type { ComputerUseServerRuntime } from './server/runtime'
import type { ActiveTask } from './state'
import type { WorkflowDefinition } from './workflows/types'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { executeApprovedPtyCreate, registerPtyTools } from './server/register-pty'
import { RunStateManager } from './state'
import {
  createPtySession,
  isPtyAvailable,
  readPtyScreen,
  writeToPty,
} from './terminal/pty-runner'
import { createTestConfig } from './test-fixtures'
import { executeWorkflow } from './workflows/engine'

vi.mock('./terminal/pty-runner', () => ({
  createPtySession: vi.fn(),
  destroyAllPtySessions: vi.fn(),
  destroyPtySession: vi.fn(),
  getPtyAvailabilityInfo: vi.fn().mockResolvedValue({ available: true }),
  isPtyAvailable: vi.fn(),
  listPtySessions: vi.fn(),
  readPtyScreen: vi.fn(),
  resizePty: vi.fn(),
  writeToPty: vi.fn(),
}))

type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>

function createMockServer() {
  const handlers = new Map<string, ToolHandler>()

  return {
    server: {
      tool(name: string, _schema: unknown, handler: ToolHandler) {
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

function makeSuccessResult(text = 'ok', structuredContent?: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    ...(structuredContent ? { structuredContent } : {}),
  }
}

function createRuntime(stateManager: RunStateManager, approvalMode: 'never' | 'actions' = 'never') {
  return {
    config: createTestConfig({ approvalMode }),
    stateManager,
    session: {
      createPendingAction: vi.fn(),
      listPendingActions: vi.fn(() => []),
      record: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as ComputerUseServerRuntime
}

function createExecHappyPathWorkflow(projectPath: string): WorkflowDefinition {
  return {
    id: 'terminal_exec_happy_path',
    name: 'terminal exec happy path',
    description: 'Open the workspace context, run checks, and summarize via terminal exec.',
    maxRetries: 2,
    steps: [
      {
        label: 'Focus IDE workspace',
        kind: 'ensure_app',
        description: 'Focus the IDE before running terminal checks.',
        params: { app: 'Cursor' },
        critical: true,
      },
      {
        label: 'Print working directory',
        kind: 'run_command',
        description: 'Confirm the current project directory.',
        params: { command: 'pwd', cwd: projectPath },
        critical: true,
      },
      {
        label: 'Inspect workspace diff',
        kind: 'run_command',
        description: 'Inspect current workspace changes.',
        params: { command: 'git diff --stat', cwd: projectPath },
        critical: true,
      },
      {
        label: 'Run workspace tests',
        kind: 'run_command',
        description: 'Run the terminal test command.',
        params: { command: 'pnpm test', cwd: projectPath },
        critical: true,
      },
      {
        label: 'Summarize result',
        kind: 'summarize',
        description: 'Summarize the terminal validation result.',
        params: {},
      },
    ],
  }
}

function makeSingleStepTask(params: {
  id: string
  workflowId: string
  label: string
  stepId: string
}): ActiveTask {
  return {
    id: params.id,
    goal: params.label,
    workflowId: params.workflowId,
    phase: 'executing',
    steps: [
      {
        index: 1,
        stepId: params.stepId,
        label: params.label,
      },
    ],
    currentStepIndex: 0,
    startedAt: new Date().toISOString(),
    failureCount: 0,
    maxConsecutiveFailures: 2,
  }
}

describe('terminal release gates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exec happy path: opens workspace, runs checks/tests, writes back state, and continues', async () => {
    const projectPath = '/Users/liuziheng/airi'
    const workflow = createExecHappyPathWorkflow(projectPath)
    const stateManager = new RunStateManager()

    const executeAction: ExecuteAction = vi.fn().mockImplementation(async (action) => {
      if (action.kind === 'focus_app') {
        const app = action.input.app as string
        stateManager.updateForegroundContext({
          available: true,
          appName: app,
          windowTitle: `${app} workspace`,
          platform: 'darwin',
        })
        if (app === 'Cursor') {
          stateManager.updateVscodeWorkspace(projectPath)
        }
        return makeSuccessResult(`focused ${app}`)
      }

      if (action.kind !== 'terminal_exec') {
        return makeSuccessResult('non-terminal action')
      }

      const command = action.input.command as string
      const cwd = (action.input.cwd as string | undefined) ?? projectPath

      if (command === 'git diff --stat') {
        expect(stateManager.getState().lastTerminalResult?.command).toBe('pwd')
      }

      if (command === 'pnpm test') {
        expect(stateManager.getState().lastTerminalResult?.command).toBe('git diff --stat')
      }

      let stdout = 'ok\n'
      if (command === 'pwd') {
        stdout = `${cwd}\n`
      }
      else if (command === 'git diff --stat') {
        stdout = ' packages/stage-ui/src/stores/chat.ts | 4 ++--\n'
      }
      else if (command === 'pnpm test') {
        stdout = ' Test Files  29 passed (29)\n'
      }

      stateManager.updateTerminalResult({
        command,
        stdout,
        stderr: '',
        exitCode: 0,
        effectiveCwd: cwd,
        durationMs: 12,
        timedOut: false,
      })

      return makeSuccessResult(stdout, {
        status: 'ok',
        stdout,
        stderr: '',
        exitCode: 0,
        effectiveCwd: cwd,
      })
    })

    const result = await executeWorkflow({
      workflow,
      executeAction,
      stateManager,
    })

    expect(result.success).toBe(true)
    expect(result.status).toBe('completed')
    expect(result.stepResults.every(step => step.status === 'success')).toBe(true)
    expect(stateManager.getState().vscode?.workspacePath).toBe(projectPath)
    expect(stateManager.getState().terminalState).toMatchObject({
      effectiveCwd: projectPath,
      lastExitCode: 0,
      lastCommandSummary: 'pnpm test',
    })
    expect(stateManager.getState().lastTerminalResult).toMatchObject({
      command: 'pnpm test',
      exitCode: 0,
      effectiveCwd: projectPath,
    })

    const execBindings = stateManager.getState().workflowStepTerminalBindings.filter(binding => binding.surface === 'exec')
    expect(execBindings).toHaveLength(3)
    expect(execBindings.every(binding => binding.taskId === result.task.id)).toBe(true)
    expect(stateManager.getRecentSurfaceDecision()).toMatchObject({
      surface: 'exec',
      transport: 'exec',
    })
  })

  it('pty happy path: create session, read, send input, read again, and keep the step binding', async () => {
    const stateManager = new RunStateManager()
    const runtime = createRuntime(stateManager, 'actions')
    const activeTask = makeSingleStepTask({
      id: 'task_pty_gate',
      workflowId: 'terminal_pty_gate',
      label: 'Follow interactive task in PTY',
      stepId: 'step_pty_gate',
    })
    stateManager.startTask(activeTask)

    vi.mocked(isPtyAvailable).mockResolvedValue(true)
    vi.mocked(createPtySession).mockResolvedValue({
      id: 'pty_gate_1',
      alive: true,
      rows: 24,
      cols: 80,
      screenContent: '',
      pid: 4321,
    })
    vi.mocked(readPtyScreen)
      .mockReturnValueOnce({
        id: 'pty_gate_1',
        alive: true,
        rows: 24,
        cols: 80,
        screenContent: 'pnpm dev\nwatching for changes...\n',
        pid: 4321,
      })
      .mockReturnValueOnce({
        id: 'pty_gate_1',
        alive: true,
        rows: 24,
        cols: 80,
        screenContent: 'pnpm dev\nwatching for changes...\n^C\n',
        pid: 4321,
      })

    const { server, invoke } = createMockServer()
    registerPtyTools({ server, runtime })

    const createResult = await executeApprovedPtyCreate(runtime, {
      rows: 24,
      cols: 80,
      cwd: projectPathFromTask(activeTask),
      stepId: activeTask.steps[0]!.stepId,
      approvalSessionId: 'approval_pty_gate',
    })
    expect((createResult.structuredContent as Record<string, unknown>).status).toBe('ok')

    stateManager.addStepTerminalBinding({
      taskId: activeTask.id,
      stepId: activeTask.steps[0]!.stepId,
      surface: 'pty',
      ptySessionId: 'pty_gate_1',
    })

    const firstRead = await invoke('pty_read_screen', {
      sessionId: 'pty_gate_1',
      approvalSessionId: 'approval_pty_gate',
    })
    expect((firstRead.structuredContent as Record<string, unknown>).screenContent).toBe('pnpm dev\nwatching for changes...\n')

    const sendInput = await invoke('pty_send_input', {
      sessionId: 'pty_gate_1',
      data: '\x03',
      approvalSessionId: 'approval_pty_gate',
    })
    expect((sendInput.structuredContent as Record<string, unknown>).status).toBe('ok')
    expect(writeToPty).toHaveBeenCalledWith('pty_gate_1', { data: '\x03' })

    const secondRead = await invoke('pty_read_screen', {
      sessionId: 'pty_gate_1',
      approvalSessionId: 'approval_pty_gate',
    })
    expect((secondRead.structuredContent as Record<string, unknown>).screenContent).toContain('^C')

    const session = stateManager.getPtySessions()[0]
    expect(session).toMatchObject({
      id: 'pty_gate_1',
      alive: true,
      boundStepId: 'step_pty_gate',
    })
    expect(stateManager.getStepTerminalBinding(activeTask.id, 'step_pty_gate')).toEqual({
      taskId: activeTask.id,
      stepId: 'step_pty_gate',
      surface: 'pty',
      ptySessionId: 'pty_gate_1',
    })
    expect(stateManager.hasPtyApprovalGrant('approval_pty_gate', 'pty_gate_1')).toBe(true)
    expect(stateManager.getPtyAuditForSession('pty_gate_1').map(entry => entry.event)).toEqual([
      'create',
      'read_screen',
      'send_input',
      'read_screen',
    ])
    expect(stateManager.getState().activeTask?.currentStepIndex).toBe(0)
  })

  it('exec to pty reroute happy path: reroutes formally, then continues on PTY with consistent state', async () => {
    const stateManager = new RunStateManager()
    const runtime = createRuntime(stateManager, 'actions')
    const workflow: WorkflowDefinition = {
      id: 'terminal_exec_to_pty_gate',
      name: 'exec to pty gate',
      description: 'Reroute an interactive terminal step onto PTY and continue there.',
      maxRetries: 2,
      steps: [
        {
          label: 'Interact with vim session',
          kind: 'run_command',
          description: 'Attempt a terminal exec against an interactive TUI step.',
          params: { command: 'vim src/index.ts' },
          critical: true,
        },
      ],
    }
    const task = makeSingleStepTask({
      id: 'task_reroute_gate',
      workflowId: workflow.id,
      label: workflow.steps[0]!.label,
      stepId: 'step_reroute_gate',
    })
    stateManager.startTask(task)
    stateManager.updateForegroundContext({
      available: true,
      appName: 'Terminal',
      windowTitle: 'vim src/index.ts',
      platform: 'darwin',
    })

    vi.mocked(isPtyAvailable).mockResolvedValue(true)
    vi.mocked(createPtySession).mockResolvedValue({
      id: 'pty_reroute_1',
      alive: true,
      rows: 24,
      cols: 80,
      screenContent: '',
      pid: 9876,
    })
    vi.mocked(readPtyScreen)
      .mockReturnValueOnce({
        id: 'pty_reroute_1',
        alive: true,
        rows: 24,
        cols: 80,
        screenContent: 'vim src/index.ts\n-- INSERT --',
        pid: 9876,
      })
      .mockReturnValueOnce({
        id: 'pty_reroute_1',
        alive: true,
        rows: 24,
        cols: 80,
        screenContent: 'src/index.ts written\n',
        pid: 9876,
      })

    await executeApprovedPtyCreate(runtime, {
      rows: 24,
      cols: 80,
      stepId: 'step_reroute_gate',
      approvalSessionId: 'approval_reroute_gate',
    })

    const executeAction: ExecuteAction = vi.fn().mockResolvedValue(makeSuccessResult('should not execute via exec'))
    const result = await executeWorkflow({
      workflow,
      executeAction,
      stateManager,
      _resume: {
        startIndex: 0,
        previousResults: [],
        existingTask: task,
      },
    })

    expect(result.success).toBe(false)
    expect(result.status).toBe('reroute_required')
    expect(result.rerouteAdvisory?.kind).toBe('use_pty_surface')
    expect(executeAction).not.toHaveBeenCalled()
    expect(stateManager.getRecentSurfaceDecision()).toMatchObject({
      surface: 'pty',
      transport: 'pty',
    })
    expect(stateManager.getStepTerminalBinding(task.id, 'step_reroute_gate')).toEqual({
      taskId: task.id,
      stepId: 'step_reroute_gate',
      surface: 'pty',
      ptySessionId: 'pty_reroute_1',
    })
    expect(stateManager.hasPtyApprovalGrant('approval_reroute_gate', 'pty_reroute_1')).toBe(true)

    const { server, invoke } = createMockServer()
    registerPtyTools({ server, runtime })

    const screenBefore = await invoke('pty_read_screen', {
      sessionId: 'pty_reroute_1',
      approvalSessionId: 'approval_reroute_gate',
    })
    expect((screenBefore.structuredContent as Record<string, unknown>).screenContent).toContain('-- INSERT --')

    await invoke('pty_send_input', {
      sessionId: 'pty_reroute_1',
      data: ':wq\r',
      approvalSessionId: 'approval_reroute_gate',
    })

    const screenAfter = await invoke('pty_read_screen', {
      sessionId: 'pty_reroute_1',
      approvalSessionId: 'approval_reroute_gate',
    })
    expect((screenAfter.structuredContent as Record<string, unknown>).screenContent).toContain('written')

    const session = stateManager.getPtySessions()[0]
    expect(session).toMatchObject({
      id: 'pty_reroute_1',
      alive: true,
      boundStepId: 'step_reroute_gate',
    })
    expect(stateManager.getStepTerminalBinding(task.id, 'step_reroute_gate')).toMatchObject({
      surface: 'pty',
      ptySessionId: 'pty_reroute_1',
    })
    expect(stateManager.hasPtyApprovalGrant('approval_reroute_gate', 'pty_reroute_1')).toBe(true)
    expect(stateManager.getPtyAuditForSession('pty_reroute_1').map(entry => entry.event)).toEqual([
      'create',
      'read_screen',
      'send_input',
      'read_screen',
    ])
  })
})

function projectPathFromTask(_task: ActiveTask) {
  return '/Users/liuziheng/airi'
}
