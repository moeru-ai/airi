import type { ComputerUseServerRuntime } from './runtime'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RunStateManager } from '../state'
import {
  destroyPtySession,
  readPtyScreen,
  writeToPty,
} from '../terminal/pty-runner'
import { createTestConfig } from '../test-fixtures'
import { createWorkflowPrepToolExecutor } from './workflow-prep-tools'

vi.mock('../terminal/pty-runner', () => ({
  destroyPtySession: vi.fn(),
  readPtyScreen: vi.fn(),
  writeToPty: vi.fn(),
}))

describe('createWorkflowPrepToolExecutor', () => {
  let runtime: ComputerUseServerRuntime
  let stateManager: RunStateManager

  beforeEach(() => {
    vi.clearAllMocks()
    stateManager = new RunStateManager()
    stateManager.startTask({
      currentStepIndex: 0,
      failureCount: 0,
      goal: 'workflow prep test',
      id: 'task_workflow_prep',
      maxConsecutiveFailures: 2,
      phase: 'executing',
      startedAt: new Date().toISOString(),
      steps: [
        {
          index: 1,
          label: 'Run interactive validation',
          outcome: undefined,
          stepId: 'step_workflow_prep',
        },
      ],
      workflowId: 'wf_test',
    })
    stateManager.registerPtySession({
      alive: true,
      cols: 80,
      cwd: '/tmp',
      id: 'pty_1',
      pid: 1234,
      rows: 24,
    })

    runtime = {
      browserDomBridge: { getStatus: vi.fn(), readAllFramesDom: vi.fn() },
      cdpBridgeManager: { ensureBridge: vi.fn() },
      config: createTestConfig({ approvalMode: 'never' }),
      stateManager,
    } as unknown as ComputerUseServerRuntime
  })

  it('writes audit entries for internal PTY send/read/destroy operations', async () => {
    const executePrepTool = createWorkflowPrepToolExecutor(runtime)

    vi.mocked(readPtyScreen).mockReturnValue({
      alive: true,
      cols: 80,
      id: 'pty_1',
      pid: 1234,
      rows: 24,
      screenContent: 'VIM - Vi IMproved\nversion 9.0\n',
    })

    await executePrepTool('pty_send_input:pty_1:vim --version')
    await executePrepTool('pty_read_screen:pty_1')
    await executePrepTool('pty_destroy:pty_1')

    expect(writeToPty).toHaveBeenCalledWith('pty_1', { data: 'vim --version' })
    expect(destroyPtySession).toHaveBeenCalledWith('pty_1')

    expect(stateManager.getPtyAuditForSession('pty_1').map(entry => entry.event)).toEqual([
      'send_input',
      'read_screen',
      'destroy',
    ])
    expect(stateManager.getPtyAuditForSession('pty_1')[0]).toMatchObject({
      byteCount: 'vim --version'.length,
      stepId: 'step_workflow_prep',
      taskId: 'task_workflow_prep',
    })
    expect(stateManager.getPtyAuditForSession('pty_1')[1]).toMatchObject({
      alive: true,
      returnedLineCount: 2,
    })
  })

  it('requires an active PTY approval grant when approvals are enabled', async () => {
    runtime.config = createTestConfig({ approvalMode: 'actions' })
    const executePrepTool = createWorkflowPrepToolExecutor(runtime)

    const result = await executePrepTool('pty_send_input:pty_1:vim --version')

    expect(result.isError).toBe(true)
    expect(result.structuredContent).toMatchObject({
      operation: 'pty_send_input',
      sessionId: 'pty_1',
      status: 'pty_grant_required',
    })
    expect(writeToPty).not.toHaveBeenCalled()
  })

  it('allows PTY prep operations when a grant is active', async () => {
    runtime.config = createTestConfig({ approvalMode: 'actions' })
    stateManager.grantPtyApproval('approval_1', 'pty_1')
    const executePrepTool = createWorkflowPrepToolExecutor(runtime)

    const result = await executePrepTool('pty_send_input:pty_1:vim --version')

    expect(result.isError).not.toBe(true)
    expect(writeToPty).toHaveBeenCalledWith('pty_1', { data: 'vim --version' })
  })
})
