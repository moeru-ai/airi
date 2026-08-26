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
import { createDevValidateWorkspaceWorkflow } from './workflows/dev-validate-workspace'
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
    async invoke(name: string, args: Record<string, unknown> = {}) {
      const handler = handlers.get(name)
      if (!handler) {
        throw new Error(`Missing registered tool: ${name}`)
      }

      return await handler(args)
    },
    server: {
      tool(name: string, _schema: unknown, handler: ToolHandler) {
        handlers.set(name, handler)
      },
    } as unknown as McpServer,
  }
}

function createRuntime(stateManager: RunStateManager, approvalMode: 'actions' | 'never' = 'never') {
  return {
    config: createTestConfig({ approvalMode }),
    session: {
      createPendingAction: vi.fn(),
      listPendingActions: vi.fn(() => []),
      record: vi.fn().mockResolvedValue(undefined),
    },
    stateManager,
  } as unknown as ComputerUseServerRuntime
}

function makeSingleStepTask(params: {
  id: string
  label: string
  stepId: string
  workflowId: string
}): ActiveTask {
  return {
    currentStepIndex: 0,
    failureCount: 0,
    goal: params.label,
    id: params.id,
    maxConsecutiveFailures: 2,
    phase: 'executing',
    startedAt: new Date().toISOString(),
    steps: [
      {
        index: 1,
        label: params.label,
        stepId: params.stepId,
      },
    ],
    workflowId: params.workflowId,
  }
}

function makeSuccessResult(text = 'ok', structuredContent?: Record<string, unknown>): CallToolResult {
  return {
    content: [{ text, type: 'text' }],
    ...(structuredContent ? { structuredContent } : {}),
  }
}

describe('terminal release gates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exec happy path: opens workspace, runs checks/tests, writes back state, and continues', async () => {
    const projectPath = '/workspace/airi'
    const workflow = createDevValidateWorkspaceWorkflow({
      changesCommand: 'git diff --stat',
      checkCommand: 'pnpm test',
      fileManagerApp: 'Finder',
      ideApp: 'Cursor',
      projectPath,
    })
    const stateManager = new RunStateManager()

    const executeAction: ExecuteAction = vi.fn().mockImplementation(async (action) => {
      if (action.kind === 'focus_app') {
        const app = action.input.app as string
        stateManager.updateForegroundContext({
          appName: app,
          available: true,
          platform: 'darwin',
          windowTitle: `${app} workspace`,
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
        durationMs: 12,
        effectiveCwd: cwd,
        exitCode: 0,
        stderr: '',
        stdout,
        timedOut: false,
      })

      return makeSuccessResult(stdout, {
        effectiveCwd: cwd,
        exitCode: 0,
        status: 'ok',
        stderr: '',
        stdout,
      })
    })

    const result = await executeWorkflow({
      executeAction,
      stateManager,
      workflow,
    })

    expect(result.success).toBe(true)
    expect(result.status).toBe('completed')
    expect(result.stepResults.every(step => step.status === 'success')).toBe(true)
    expect(stateManager.getState().vscode?.workspacePath).toBe(projectPath)
    expect(stateManager.getState().terminalState).toMatchObject({
      effectiveCwd: projectPath,
      lastCommandSummary: 'pnpm test',
      lastExitCode: 0,
    })
    expect(stateManager.getState().lastTerminalResult).toMatchObject({
      command: 'pnpm test',
      effectiveCwd: projectPath,
      exitCode: 0,
    })

    const execBindings = stateManager.getState().workflowStepTerminalBindings.filter(binding => binding.surface === 'exec')
    expect(execBindings).toHaveLength(5)
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
      label: 'Follow interactive task in PTY',
      stepId: 'step_pty_gate',
      workflowId: 'terminal_pty_gate',
    })
    stateManager.startTask(activeTask)

    vi.mocked(isPtyAvailable).mockResolvedValue(true)
    vi.mocked(createPtySession).mockResolvedValue({
      alive: true,
      cols: 80,
      id: 'pty_gate_1',
      pid: 4321,
      rows: 24,
      screenContent: '',
    })
    vi.mocked(readPtyScreen)
      .mockReturnValueOnce({
        alive: true,
        cols: 80,
        id: 'pty_gate_1',
        pid: 4321,
        rows: 24,
        screenContent: 'pnpm dev\nwatching for changes...\n',
      })
      .mockReturnValueOnce({
        alive: true,
        cols: 80,
        id: 'pty_gate_1',
        pid: 4321,
        rows: 24,
        screenContent: 'pnpm dev\nwatching for changes...\n^C\n',
      })

    const { invoke, server } = createMockServer()
    registerPtyTools({ runtime, server })

    const createResult = await executeApprovedPtyCreate(runtime, {
      approvalSessionId: 'approval_pty_gate',
      cols: 80,
      cwd: projectPathFromTask(activeTask),
      rows: 24,
      stepId: activeTask.steps[0]!.stepId,
    })
    expect((createResult.structuredContent as Record<string, unknown>).status).toBe('ok')

    stateManager.addStepTerminalBinding({
      ptySessionId: 'pty_gate_1',
      stepId: activeTask.steps[0]!.stepId,
      surface: 'pty',
      taskId: activeTask.id,
    })

    const firstRead = await invoke('pty_read_screen', {
      approvalSessionId: 'approval_pty_gate',
      sessionId: 'pty_gate_1',
    })
    expect((firstRead.structuredContent as Record<string, unknown>).screenContent).toBe('pnpm dev\nwatching for changes...\n')

    const sendInput = await invoke('pty_send_input', {
      approvalSessionId: 'approval_pty_gate',
      data: '\x03',
      sessionId: 'pty_gate_1',
    })
    expect((sendInput.structuredContent as Record<string, unknown>).status).toBe('ok')
    expect(writeToPty).toHaveBeenCalledWith('pty_gate_1', { data: '\x03' })

    const secondRead = await invoke('pty_read_screen', {
      approvalSessionId: 'approval_pty_gate',
      sessionId: 'pty_gate_1',
    })
    expect((secondRead.structuredContent as Record<string, unknown>).screenContent).toContain('^C')

    const session = stateManager.getPtySessions()[0]
    expect(session).toMatchObject({
      alive: true,
      boundStepId: 'step_pty_gate',
      id: 'pty_gate_1',
    })
    expect(stateManager.getStepTerminalBinding(activeTask.id, 'step_pty_gate')).toEqual({
      ptySessionId: 'pty_gate_1',
      stepId: 'step_pty_gate',
      surface: 'pty',
      taskId: activeTask.id,
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
      description: 'Reroute an interactive terminal step onto PTY and continue there.',
      id: 'terminal_exec_to_pty_gate',
      maxRetries: 2,
      name: 'exec to pty gate',
      steps: [
        {
          critical: true,
          description: 'Attempt a terminal exec against an interactive TUI step.',
          kind: 'run_command',
          label: 'Interact with vim session',
          params: { command: 'vim src/index.ts' },
        },
      ],
    }
    const task = makeSingleStepTask({
      id: 'task_reroute_gate',
      label: workflow.steps[0]!.label,
      stepId: 'step_reroute_gate',
      workflowId: workflow.id,
    })
    stateManager.startTask(task)
    stateManager.updateForegroundContext({
      appName: 'Terminal',
      available: true,
      platform: 'darwin',
      windowTitle: 'vim src/index.ts',
    })

    vi.mocked(isPtyAvailable).mockResolvedValue(true)
    vi.mocked(createPtySession).mockResolvedValue({
      alive: true,
      cols: 80,
      id: 'pty_reroute_1',
      pid: 9876,
      rows: 24,
      screenContent: '',
    })
    vi.mocked(readPtyScreen)
      .mockReturnValueOnce({
        alive: true,
        cols: 80,
        id: 'pty_reroute_1',
        pid: 9876,
        rows: 24,
        screenContent: 'vim src/index.ts\n-- INSERT --',
      })
      .mockReturnValueOnce({
        alive: true,
        cols: 80,
        id: 'pty_reroute_1',
        pid: 9876,
        rows: 24,
        screenContent: 'src/index.ts written\n',
      })

    await executeApprovedPtyCreate(runtime, {
      approvalSessionId: 'approval_reroute_gate',
      cols: 80,
      rows: 24,
      stepId: 'step_reroute_gate',
    })

    const executeAction: ExecuteAction = vi.fn().mockResolvedValue(makeSuccessResult('should not execute via exec'))
    const result = await executeWorkflow({
      _resume: {
        existingTask: task,
        previousResults: [],
        startIndex: 0,
      },
      executeAction,
      stateManager,
      workflow,
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
      ptySessionId: 'pty_reroute_1',
      stepId: 'step_reroute_gate',
      surface: 'pty',
      taskId: task.id,
    })
    expect(stateManager.hasPtyApprovalGrant('approval_reroute_gate', 'pty_reroute_1')).toBe(true)

    const { invoke, server } = createMockServer()
    registerPtyTools({ runtime, server })

    const screenBefore = await invoke('pty_read_screen', {
      approvalSessionId: 'approval_reroute_gate',
      sessionId: 'pty_reroute_1',
    })
    expect((screenBefore.structuredContent as Record<string, unknown>).screenContent).toContain('-- INSERT --')

    await invoke('pty_send_input', {
      approvalSessionId: 'approval_reroute_gate',
      data: ':wq\r',
      sessionId: 'pty_reroute_1',
    })

    const screenAfter = await invoke('pty_read_screen', {
      approvalSessionId: 'approval_reroute_gate',
      sessionId: 'pty_reroute_1',
    })
    expect((screenAfter.structuredContent as Record<string, unknown>).screenContent).toContain('written')

    const session = stateManager.getPtySessions()[0]
    expect(session).toMatchObject({
      alive: true,
      boundStepId: 'step_reroute_gate',
      id: 'pty_reroute_1',
    })
    expect(stateManager.getStepTerminalBinding(task.id, 'step_reroute_gate')).toMatchObject({
      ptySessionId: 'pty_reroute_1',
      surface: 'pty',
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
  return '/workspace/airi'
}
