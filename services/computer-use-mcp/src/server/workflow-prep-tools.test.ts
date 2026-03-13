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
      id: 'task_workflow_prep',
      goal: 'workflow prep test',
      workflowId: 'wf_test',
      phase: 'executing',
      steps: [
        {
          index: 1,
          stepId: 'step_workflow_prep',
          label: 'Run interactive validation',
          outcome: undefined,
        },
      ],
      currentStepIndex: 0,
      startedAt: new Date().toISOString(),
      failureCount: 0,
      maxConsecutiveFailures: 2,
    })
    stateManager.registerPtySession({
      id: 'pty_1',
      alive: true,
      rows: 24,
      cols: 80,
      pid: 1234,
      cwd: '/tmp',
    })

    runtime = {
      config: createTestConfig({ approvalMode: 'never' }),
      stateManager,
      browserDomBridge: { getStatus: vi.fn(), readAllFramesDom: vi.fn() },
      cdpBridgeManager: { ensureBridge: vi.fn() },
    } as unknown as ComputerUseServerRuntime
  })

  it('writes audit entries for internal PTY send/read/destroy operations', async () => {
    const executePrepTool = createWorkflowPrepToolExecutor(runtime)

    vi.mocked(readPtyScreen).mockReturnValue({
      id: 'pty_1',
      alive: true,
      rows: 24,
      cols: 80,
      screenContent: 'VIM - Vi IMproved\nversion 9.0\n',
      pid: 1234,
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
      taskId: 'task_workflow_prep',
      stepId: 'step_workflow_prep',
      byteCount: 'vim --version'.length,
    })
    expect(stateManager.getPtyAuditForSession('pty_1')[1]).toMatchObject({
      returnedLineCount: 2,
      alive: true,
    })
  })
})
