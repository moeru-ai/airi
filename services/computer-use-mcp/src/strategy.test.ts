import type { RunState } from './state'
import type { ForegroundContext } from './types'

import { describe, expect, it } from 'vitest'

import { buildRecoveryPlan, evaluateStrategy, summarizeAdvisories } from './strategy'

function createBaseState(overrides: Partial<RunState> = {}): RunState {
  return {
    pendingApprovalCount: 0,
    lastApprovalRejected: false,
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('evaluateStrategy', () => {
  it('should return proceed when no issues', () => {
    const state = createBaseState()
    const advisories = evaluateStrategy({
      proposedAction: { kind: 'screenshot', input: {} },
      state,
    })

    expect(advisories).toHaveLength(1)
    expect(advisories[0].kind).toBe('proceed')
  })

  it('should advise replan when last approval was rejected', () => {
    const state = createBaseState({
      lastApprovalRejected: true,
      lastRejectionReason: 'Too dangerous',
    })
    const advisories = evaluateStrategy({
      proposedAction: { kind: 'screenshot', input: {} },
      state,
    })

    expect(advisories.some(a => a.kind === 'approval_rejected_replan')).toBe(true)
  })

  it('should advise focus when wrong app is in foreground', () => {
    const state = createBaseState({
      activeTask: {
        id: '1',
        goal: 'Test',
        phase: 'executing',
        steps: [{ index: 1, label: 'Click in Terminal' }],
        currentStepIndex: 0,
        startedAt: new Date().toISOString(),
        failureCount: 0,
        maxConsecutiveFailures: 3,
      },
      foregroundContext: {
        available: true,
        appName: 'Finder',
        platform: 'darwin',
      },
    })
    const freshContext: ForegroundContext = {
      available: true,
      appName: 'Finder',
      platform: 'darwin',
    }
    const advisories = evaluateStrategy({
      proposedAction: { kind: 'click', input: { x: 100, y: 100 } },
      state,
      freshContext,
    })

    expect(advisories.some(a => a.kind === 'focus_app_first')).toBe(true)
  })

  it('should advise screenshot first on tainted remote runner', () => {
    const state = createBaseState({
      executionTarget: {
        mode: 'remote',
        transport: 'ssh-stdio',
        hostName: 'test-host',
        isolated: false,
        tainted: true,
      },
    })
    const advisories = evaluateStrategy({
      proposedAction: { kind: 'click', input: { x: 100, y: 100 } },
      state,
    })

    expect(advisories.some(a => a.kind === 'take_screenshot_first')).toBe(true)
  })

  it('should advise read error when last terminal command failed', () => {
    const state = createBaseState({
      lastTerminalResult: {
        command: 'pnpm test',
        stdout: '',
        stderr: 'Error: tests failed',
        exitCode: 1,
        effectiveCwd: '/test',
        durationMs: 100,
        timedOut: false,
      },
    })
    const advisories = evaluateStrategy({
      proposedAction: { kind: 'terminal_exec', input: { command: 'pnpm test' } },
      state,
    })

    expect(advisories.some(a => a.kind === 'read_error_first')).toBe(true)
  })

  it('should advise abort when too many failures', () => {
    const state = createBaseState({
      activeTask: {
        id: '1',
        goal: 'Test',
        phase: 'executing',
        steps: [
          { index: 1, label: 'Step 1', outcome: 'failure', outcomeReason: 'err1' },
          { index: 2, label: 'Step 2', outcome: 'failure', outcomeReason: 'err2' },
          { index: 3, label: 'Step 3', outcome: 'failure', outcomeReason: 'err3' },
        ],
        currentStepIndex: 2,
        startedAt: new Date().toISOString(),
        failureCount: 3,
        maxConsecutiveFailures: 3,
      },
    })
    const advisories = evaluateStrategy({
      proposedAction: { kind: 'terminal_exec', input: { command: 'test' } },
      state,
    })

    expect(advisories.some(a => a.kind === 'abort_task')).toBe(true)
  })
})

describe('buildRecoveryPlan', () => {
  it('should suggest wait_and_retry on timeout', () => {
    const result = buildRecoveryPlan({
      failedAction: { kind: 'terminal_exec', input: { command: 'slow-cmd' } },
      errorMessage: 'process timeout after 30000ms',
      state: createBaseState(),
    })

    expect(result.kind).toBe('wait_and_retry')
  })

  it('should suggest read_error_first on terminal failure', () => {
    const result = buildRecoveryPlan({
      failedAction: { kind: 'terminal_exec', input: { command: 'bad-cmd' } },
      errorMessage: 'command not found',
      state: createBaseState({
        lastTerminalResult: {
          command: 'bad-cmd',
          stdout: '',
          stderr: 'command not found: bad-cmd',
          exitCode: 127,
          effectiveCwd: '/test',
          durationMs: 10,
          timedOut: false,
        },
      }),
    })

    expect(result.kind).toBe('read_error_first')
    expect(result.evidence).toBeDefined()
    expect(result.evidence!.length).toBeGreaterThan(0)
  })

  it('should suggest screenshot on generic UI failure', () => {
    const result = buildRecoveryPlan({
      failedAction: { kind: 'click', input: { x: 100, y: 100 } },
      errorMessage: 'click failed',
      state: createBaseState(),
    })

    expect(result.kind).toBe('take_screenshot_first')
    expect(result.suggestedAction?.kind).toBe('screenshot')
  })
})

describe('summarizeAdvisories', () => {
  it('should return empty string for proceed-only', () => {
    const result = summarizeAdvisories([{ kind: 'proceed', reason: 'ok' }])
    expect(result).toBe('')
  })

  it('should format advisory summary', () => {
    const result = summarizeAdvisories([
      { kind: 'focus_app_first', reason: 'Wrong app' },
      { kind: 'read_error_first', reason: 'Error exists' },
    ])
    expect(result).toContain('[focus_app_first]')
    expect(result).toContain('[read_error_first]')
  })
})
