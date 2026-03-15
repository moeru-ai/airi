import { describe, expect, it } from 'vitest'

import { RunStateManager } from './state'

function createPlanSession(index: number) {
  return {
    id: `session_${index}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    status: 'active' as const,
    amendCount: 0,
    backtrackCount: 0,
    maxAmendCount: 2 as const,
    maxBacktrackCount: 1 as const,
    maxFiles: 2 as const,
    changeIntent: 'behavior_fix' as const,
    steps: [{
      filePath: 'src/main.ts',
      intent: 'behavior_fix' as const,
      source: 'target_selection' as const,
      status: 'ready' as const,
      dependsOn: [],
      checkpoint: 'none' as const,
    }],
    reason: 'test-session',
  }
}

function createCausalTrace(index: number, rootCauseType: 'wrong_target' | 'missed_dependency' | 'incomplete_change' = 'incomplete_change') {
  return {
    traceId: `trace_${index}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 1, index)).toISOString(),
    rootCauseType,
    nodes: [{ id: `signal:${index}`, kind: 'signal' as const, label: `signal_${index}` }],
    edges: [{
      from: `signal:${index}`,
      to: `decision:${index}`,
      relation: 'supports' as const,
      strength: 0.7,
      source: 'competition' as const,
    }],
    counterfactualChecks: [],
  }
}

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

  it('compacts oversized coding state buckets while preserving anchors', () => {
    const manager = new RunStateManager()
    const traceLog = Array.from({ length: 70 }, (_, index) => createCausalTrace(index, index % 3 === 0 ? 'wrong_target' : index % 3 === 1 ? 'missed_dependency' : 'incomplete_change'))

    manager.updateCodingState({
      workspacePath: '/tmp/workspace',
      gitSummary: 'clean',
      recentReads: Array.from({ length: 160 }, (_, index) => ({ path: `src/read-${index}.ts`, range: 'all' })),
      recentEdits: Array.from({ length: 160 }, (_, index) => ({ path: `src/edit-${index}.ts`, summary: 'edited' })),
      recentCommandResults: Array.from({ length: 100 }, (_, index) => `Command ${index}`),
      recentSearches: Array.from({ length: 100 }, (_, index) => `Search ${index}`),
      pendingIssues: Array.from({ length: 60 }, (_, index) => `Issue ${index}`),
      planHistory: Array.from({ length: 40 }, (_, index) => createPlanSession(index)),
      lastCausalTrace: traceLog[traceLog.length - 1],
      causalTraceLog: traceLog,
      lastPlannerDecision: {
        selectedFile: 'src/main.ts',
        candidateScores: [{ filePath: 'src/main.ts', status: 'ready', score: 120, reasons: ['selected'] }],
        decisionReason: 'selected for recovery',
        selectionMode: 'recovery_retry',
      },
    })

    const coding = manager.getState().coding
    expect(coding).toBeDefined()
    expect((coding?.recentReads || []).length).toBeLessThanOrEqual(40)
    expect((coding?.recentEdits || []).length).toBeLessThanOrEqual(40)
    expect((coding?.recentCommandResults || []).length).toBeLessThanOrEqual(20)
    expect((coding?.recentSearches || []).length).toBeLessThanOrEqual(20)
    expect((coding?.pendingIssues || []).length).toBeLessThanOrEqual(20)
    expect((coding?.planHistory || []).length).toBeLessThanOrEqual(12)
    expect((coding?.causalTraceLog || []).length).toBeLessThanOrEqual(24)
    expect(coding?.causalTraceLog?.some(trace => trace.traceId === 'trace_69')).toBe(true)
    expect(coding?.lastPlannerDecision?.selectedFile).toBe('src/main.ts')
    expect(coding?.compactionMeta?.compactionCount).toBeGreaterThan(0)
    expect((coding?.compactionMeta?.compactedBuckets || []).length).toBeGreaterThan(0)
  })

  it('rebuilds round context from anchors via memory refresh hook', () => {
    const manager = new RunStateManager()

    manager.updateCodingState({
      workspacePath: '/tmp/workspace',
      gitSummary: 'clean',
      recentReads: [],
      recentEdits: [],
      recentCommandResults: [],
      recentSearches: [],
      pendingIssues: ['manual_follow_up'],
      lastPlannerDecision: {
        selectedFile: 'src/main.ts',
        candidateScores: [{ filePath: 'src/main.ts', status: 'ready', score: 120, reasons: ['selected'] }],
        decisionReason: 'Planner selected src/main.ts via recovery_retry',
        selectionMode: 'recovery_retry',
      },
      currentPlanSession: {
        id: 'session_active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'active',
        amendCount: 1,
        backtrackCount: 0,
        maxAmendCount: 2,
        maxBacktrackCount: 1,
        maxFiles: 2,
        changeIntent: 'behavior_fix',
        steps: [{
          filePath: 'src/main.ts',
          intent: 'behavior_fix',
          source: 'target_selection',
          status: 'in_progress',
          dependsOn: [],
          checkpoint: 'none',
        }],
        reason: 'test',
      },
      lastChangeReview: {
        status: 'needs_follow_up',
        filesReviewed: ['src/main.ts'],
        diffSummary: '1 file changed',
        validationSummary: 'Validation failed',
        detectedRisks: ['validation_failed'],
        unresolvedIssues: ['rerun_validation'],
        recommendedNextAction: 'Run scoped validation.',
      },
    })

    manager.refreshCodingRoundContext()
    const roundContext = manager.getState().coding?.roundContext

    expect(roundContext).toBeDefined()
    expect(roundContext?.activeFile).toBe('src/main.ts')
    expect(roundContext?.activeIntent).toBe('behavior_fix')
    expect(roundContext?.sessionStatus).toBe('active')
    expect(roundContext?.unresolvedRisks).toContain('validation_failed')
    expect(roundContext?.unresolvedIssues).toContain('manual_follow_up')
    expect((roundContext?.nextStepHint || '')).toContain('Planner selected src/main.ts')
    expect((roundContext?.anchors || []).some(anchor => anchor.includes('last_decision:src/main.ts'))).toBe(true)
  })

  it('keeps deterministic anchors stable across long rounds with compaction', () => {
    const manager = new RunStateManager()

    manager.updateCodingState({
      workspacePath: '/tmp/workspace',
      gitSummary: 'clean',
      recentReads: [],
      recentEdits: [],
      recentCommandResults: [],
      recentSearches: [],
      pendingIssues: [],
      lastPlannerDecision: {
        selectedFile: 'src/main.ts',
        candidateScores: [{ filePath: 'src/main.ts', status: 'ready', score: 120, reasons: ['selected'] }],
        decisionReason: 'Planner selected src/main.ts',
        selectionMode: 'dependency_ready',
      },
      currentPlanSession: {
        id: 'session_long_round',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'active',
        amendCount: 0,
        backtrackCount: 0,
        maxAmendCount: 2,
        maxBacktrackCount: 1,
        maxFiles: 2,
        changeIntent: 'behavior_fix',
        steps: [{
          filePath: 'src/main.ts',
          intent: 'behavior_fix',
          source: 'target_selection',
          status: 'in_progress',
          dependsOn: [],
          checkpoint: 'none',
        }],
        reason: 'long-round',
      },
    })

    for (let round = 0; round < 6; round += 1) {
      const traceBatch = Array.from({ length: 30 }, (_, index) => createCausalTrace(round * 30 + index))
      manager.updateCodingState({
        recentCommandResults: Array.from({ length: 120 }, (_, index) => `round=${round} cmd=${index}`),
        recentSearches: Array.from({ length: 120 }, (_, index) => `round=${round} search=${index}`),
        pendingIssues: Array.from({ length: 50 }, (_, index) => `round=${round} issue=${index}`),
        planHistory: Array.from({ length: 35 }, (_, index) => createPlanSession(round * 35 + index)),
        lastCausalTrace: traceBatch[traceBatch.length - 1],
        causalTraceLog: [...(manager.getState().coding?.causalTraceLog || []), ...traceBatch],
      })
      manager.refreshCodingRoundContext()
    }

    const coding = manager.getState().coding
    expect(coding?.lastPlannerDecision?.selectedFile).toBe('src/main.ts')
    expect(coding?.roundContext?.activeFile).toBe('src/main.ts')
    expect((coding?.causalTraceLog || []).length).toBeLessThanOrEqual(24)
    expect((coding?.planHistory || []).length).toBeLessThanOrEqual(12)
    expect(coding?.compactionMeta?.compactionCount).toBeGreaterThan(0)
  })
})
