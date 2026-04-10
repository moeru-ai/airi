import { describe, expect, it } from 'vitest'

import { RunStateManager } from './state'

describe('runStateManager', () => {
  it('should initialize with empty state', () => {
    const manager = new RunStateManager()
    const state = manager.getState()

    expect(state.activeApp).toBeUndefined()
    expect(state.activeWindowTitle).toBeUndefined()
    expect(state.pendingApprovalCount).toBe(0)
    expect(state.lastApprovalRejected).toBe(false)
    expect(state.activeTask).toBeUndefined()
    expect(state.updatedAt).toBeDefined()
  })

  it('should track foreground context', () => {
    const manager = new RunStateManager()
    manager.updateForegroundContext({
      available: true,
      appName: 'Terminal',
      windowTitle: 'bash — 80x24',
      platform: 'darwin',
    })

    const state = manager.getState()
    expect(state.activeApp).toBe('Terminal')
    expect(state.activeWindowTitle).toBe('bash — 80x24')
    expect(state.foregroundContext?.appName).toBe('Terminal')
  })

  it('should track terminal results', () => {
    const manager = new RunStateManager()
    manager.updateTerminalResult({
      command: 'pnpm test:run',
      stdout: 'All tests passed',
      stderr: '',
      exitCode: 0,
      effectiveCwd: '/Users/test/project',
      durationMs: 500,
      timedOut: false,
    })

    const state = manager.getState()
    expect(state.terminalState?.effectiveCwd).toBe('/Users/test/project')
    expect(state.terminalState?.lastExitCode).toBe(0)
    expect(state.lastTerminalResult?.exitCode).toBe(0)
    expect(manager.lastTerminalSucceeded()).toBe(true)
  })

  it('should track approval outcomes', () => {
    const manager = new RunStateManager()

    manager.recordApprovalOutcome(true, 'Too risky')
    expect(manager.getState().lastApprovalRejected).toBe(true)
    expect(manager.getState().lastRejectionReason).toBe('Too risky')

    manager.recordApprovalOutcome(false)
    expect(manager.getState().lastApprovalRejected).toBe(false)
    expect(manager.getState().lastRejectionReason).toBeUndefined()
  })

  it('should manage task lifecycle', () => {
    const manager = new RunStateManager()

    const task = {
      id: 'test-task-1',
      goal: 'Run tests',
      workflowId: 'dev_run_tests',
      phase: 'executing' as const,
      steps: [
        { index: 1, stepId: 'step_a', label: 'cd project' },
        { index: 2, stepId: 'step_b', label: 'pnpm test' },
      ],
      currentStepIndex: 0,
      startedAt: new Date().toISOString(),
      failureCount: 0,
      maxConsecutiveFailures: 3,
    }

    manager.startTask(task)
    expect(manager.hasActiveTask()).toBe(true)
    expect(manager.getState().activeTask?.goal).toBe('Run tests')

    manager.completeCurrentStep('success')
    expect(manager.getState().activeTask?.steps[0].outcome).toBe('success')

    manager.advanceTaskStep({ index: 2, stepId: 'step_b', label: 'pnpm test' })
    manager.completeCurrentStep('failure', 'Tests failed')
    expect(manager.getState().activeTask?.failureCount).toBe(1)

    manager.finishTask('failed')
    expect(manager.getState().activeTask?.phase).toBe('failed')
    expect(manager.hasActiveTask()).toBe(false)
  })

  it('should detect app in foreground', () => {
    const manager = new RunStateManager()
    manager.updateForegroundContext({
      available: true,
      appName: 'Google Chrome',
      platform: 'darwin',
    })

    expect(manager.isAppInForeground('Chrome')).toBe(true)
    expect(manager.isAppInForeground('Terminal')).toBe(false)
  })

  it('should track browser surface availability', () => {
    const manager = new RunStateManager()
    manager.updateBrowserSurfaceAvailability({
      executionMode: 'local-windowed',
      suitable: true,
      availableSurfaces: ['browser_dom'],
      preferredSurface: 'browser_dom',
      selectedToolName: 'browser_dom_read_page',
      reason: 'Browser extension bridge is connected.',
      extension: {
        enabled: true,
        connected: true,
      },
      cdp: {
        endpoint: 'http://localhost:9222',
        connected: false,
        connectable: false,
        lastError: 'connection refused',
      },
    })

    expect(manager.getState().browserSurfaceAvailability).toMatchObject({
      preferredSurface: 'browser_dom',
      selectedToolName: 'browser_dom_read_page',
    })
  })
})
