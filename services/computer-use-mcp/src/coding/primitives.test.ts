import child_process from 'node:child_process'
import fs from 'node:fs/promises'

import { McpError } from '@modelcontextprotocol/sdk/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildPlanGraphFromSession } from './planner-graph'
import { CodingPrimitives } from './primitives'

import * as searchModule from './search'

vi.mock('node:fs/promises')
vi.mock('node:child_process')

describe('codingPrimitives', () => {
  const mockConfig = { workspaceRoot: '/mock/workspace/root' }

  function createRuntime(initialCodingState: Record<string, any> = {}, extras: Record<string, any> = {}) {
    let codingState: Record<string, any> = {
      workspacePath: '/mock/workspace/root',
      gitSummary: '',
      recentReads: [],
      recentEdits: [],
      recentCommandResults: [],
      recentSearches: [],
      pendingIssues: [],
      ...initialCodingState,
    }

    const runtime = {
      config: mockConfig,
      stateManager: {
        updateCodingState: vi.fn((update: Record<string, any>) => {
          codingState = { ...codingState, ...update }
        }),
        getState: vi.fn(() => ({
          coding: codingState,
          ...extras,
        })),
      },
    }

    return {
      runtime,
      getCodingState: () => codingState,
    }
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(child_process.exec).mockImplementation((cmd, options, callback) => {
      const command = String(cmd)
      if (command.startsWith('git diff --stat')) {
        callback?.(null, ' src/example.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n', '')
        return {} as any
      }
      if (callback)
        callback(null, 'mock command output', '')
      return {} as any
    })
    vi.mocked(child_process.execFile).mockImplementation(((file: string, args: string[], options: unknown, callback?: (error: Error | null, stdout: string, stderr: string) => void) => {
      const command = `${file} ${args.join(' ')}`
      if (command.startsWith('git diff --name-only')) {
        callback?.(null, '', '')
        return {} as any
      }
      if (command.startsWith('git diff --stat')) {
        callback?.(null, ' src/example.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n', '')
        return {} as any
      }
      callback?.(null, '', '')
      return {} as any
    }) as any)
  })

  it('rejects path escape attempts in readFile', async () => {
    const { runtime } = createRuntime()
    // @ts-expect-error mock runtime
    const primitives = new CodingPrimitives(runtime)

    await expect(primitives.readFile('../outside.txt'))
      .rejects
      .toThrow(McpError)

    await expect(primitives.readFile('/mock/workspace/root2/file.txt'))
      .rejects
      .toThrow(McpError)
  })

  it('allows safe workspace paths', async () => {
    const { runtime } = createRuntime({
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'inside.txt',
        candidates: [],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
    })
    // @ts-expect-error mock runtime
    const primitives = new CodingPrimitives(runtime)

    vi.mocked(fs.readFile).mockResolvedValue('file content')

    const result = await primitives.readFile('auto')
    expect(result).toBe('file content')
  })

  it('normalizes trailing-slash workspace roots before boundary checks', async () => {
    const { runtime } = createRuntime({
      workspacePath: '/mock/workspace/root/',
    })
    const primitives = new CodingPrimitives(runtime as any)

    vi.mocked(fs.readFile).mockResolvedValue('file content')

    const result = await primitives.readFile('/mock/workspace/root/src/example.ts')
    expect(result).toBe('file content')
  })

  it('provides compressContext deterministically', async () => {
    const { runtime } = createRuntime()
    // @ts-expect-error mock runtime
    const primitives = new CodingPrimitives(runtime)

    const snapshot = await primitives.compressContext('goal', 'files', 'results', 'issues', 'next')
    expect(snapshot).toEqual({
      goal: 'goal',
      filesSummary: 'files',
      recentResultSummary: 'results',
      unresolvedIssues: 'issues',
      nextStepRecommendation: 'next',
    })
  })

  it('infers deterministic auto context fields from coding and terminal state', async () => {
    const { runtime } = createRuntime({
      recentReads: [{ path: 'src/example.ts', range: 'all' }],
      recentEdits: [{ path: 'src/example.ts', summary: 'changed one branch' }],
      recentCommandResults: ['Command: pnpm test\nExit Code: 1\nStdout: fail\nStderr: stack'],
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/example.ts',
        candidates: [],
        reason: 'selected',
        recommendedNextAction: 'run tests',
      },
      currentPlan: {
        maxPlannedFiles: 1,
        diffBaselineFiles: [],
        reason: 'plan',
        steps: [{ filePath: 'src/example.ts', intent: 'fix', source: 'target_selection', status: 'pending' }],
      },
    }, {
      lastTerminalResult: {
        command: 'pnpm test',
        exitCode: 1,
        stdout: 'fail',
        stderr: 'stack',
        effectiveCwd: '/mock/workspace/root',
        durationMs: 42,
        timedOut: false,
      },
    })
    const primitives = new CodingPrimitives(runtime as any)

    const snapshot = await primitives.compressContext('goal', 'auto', 'auto', 'auto', 'auto')
    expect(snapshot.filesSummary).toContain('Read src/example.ts (all)')
    expect(snapshot.filesSummary).toContain('Edited src/example.ts')
    expect(snapshot.recentResultSummary).toContain('Command: pnpm test')
    expect(snapshot.unresolvedIssues).toContain('exited with code 1')
    expect(snapshot.nextStepRecommendation).toContain('Inspect the failing validation output')
  })

  it('applies patch with matching literal string', async () => {
    const { runtime } = createRuntime()
    // @ts-expect-error mock runtime
    const primitives = new CodingPrimitives(runtime)

    vi.mocked(fs.readFile).mockResolvedValue('line 1\nline 2\nline 3\nline 4')
    vi.mocked(fs.writeFile).mockResolvedValue()

    const res = await primitives.applyPatch('target.txt', 'line 2\nline 3', 'line 2 modified\nline 3 modified')

    expect(res).toContain('successfully to target.txt')
    expect(fs.writeFile).toHaveBeenCalledWith(
      '/mock/workspace/root/target.txt',
      'line 1\nline 2 modified\nline 3 modified\nline 4',
      'utf8',
    )
  })

  it('fails path check when applying patch to a different file escape', async () => {
    const { runtime } = createRuntime()
    // @ts-expect-error mock runtime
    const primitives = new CodingPrimitives(runtime)

    await expect(primitives.applyPatch('../test.txt', 'a', 'b')).rejects.toThrow(McpError)
  })

  it('reviewWorkspace preserves recent reads and commands instead of clearing', async () => {
    const { runtime } = createRuntime({
      recentReads: [{ path: 'test.ts', range: 'all' }],
      recentEdits: [{ path: 'test.ts', summary: 'test' }],
      recentCommandResults: ['Command: tests\nExit Code: 0'],
    }, {
      terminalState: {
        effectiveCwd: '/mock/workspace/root',
        lastExitCode: 1,
        lastCommandSummary: 'pnpm test',
      },
      lastTerminalResult: {
        command: 'pnpm test',
        exitCode: 1,
        stdout: 'fail',
        stderr: 'stack',
        effectiveCwd: '/mock/workspace/root',
        durationMs: 100,
        timedOut: false,
      },
    })
    const primitives = new CodingPrimitives(runtime as any)

    const result = await primitives.reviewWorkspace('/mock/workspace/root')
    expect(runtime.stateManager.updateCodingState).toHaveBeenCalled()
    expect(result.terminalSurface).toBe('exec')
    expect(result.terminalStateSummary).toMatchObject({
      effectiveCwd: '/mock/workspace/root',
      lastExitCode: 1,
      lastCommandSummary: 'pnpm test',
    })
    expect(result.recentReads.length).toBe(1)
    expect(result.recentCommandResults.length).toBe(1)
  })

  it('reviewWorkspace reports pty surface and pending issues for untouched workspace', async () => {
    const { runtime } = createRuntime({}, {
      activePtySessionId: 'pty_1',
      terminalState: {
        effectiveCwd: '/mock/workspace/root',
        lastExitCode: 0,
        lastCommandSummary: 'pwd',
      },
    })
    const primitives = new CodingPrimitives(runtime as any)

    const result = await primitives.reviewWorkspace('/mock/workspace/root')
    expect(result.terminalSurface).toBe('pty')
  })

  it('reportStatus can map "auto" strings into deterministic report fields', async () => {
    const { runtime } = createRuntime({
      recentReads: [{ path: 'test.ts', range: 'all' }],
      recentEdits: [{ path: 'test.ts', summary: 'test' }],
      recentCommandResults: ['Command: tests\nExit Code: 0\nStdout: ok\nStderr: none'],
      currentPlan: {
        maxPlannedFiles: 1,
        diffBaselineFiles: [],
        reason: 'plan',
        steps: [{ filePath: 'test.ts', intent: 'fix', source: 'target_selection', status: 'completed' }],
      },
      lastChangeReview: {
        status: 'ready_for_next_file',
        filesReviewed: ['test.ts'],
        diffSummary: '1 file changed',
        validationSummary: 'Validation passed: tests',
        detectedRisks: [],
        unresolvedIssues: [],
        recommendedNextAction: 'All planned files are completed.',
      },
    }, {
      lastTerminalResult: {
        command: 'tests',
        exitCode: 0,
        stdout: 'ok',
        stderr: 'none',
        effectiveCwd: '/mock/workspace/root',
        durationMs: 12,
        timedOut: false,
      },
    })
    const primitives = new CodingPrimitives(runtime as any)

    const report = await primitives.reportStatus(
      'auto',
      'auto',
      ['auto'],
      ['auto'],
      ['auto'],
      'auto',
    )

    expect(report.status).toBe('completed')
    expect(report.summary).toContain('ready_for_next_file')
    expect(report.filesTouched).toContain('test.ts')
    expect(report.commandsRun[0]).toContain('Command: tests')
    expect(report.nextStep).toContain('All planned files are completed')
  })

  it('reportStatus(auto) prioritizes planner decision reason and diagnosis winnerReason in in_progress mode', async () => {
    const { runtime } = createRuntime({
      lastPlannerDecision: {
        selectedFile: 'src/b.ts',
        selectionMode: 'recovery_retry',
        decisionReason: 'Planner selected src/b.ts via recovery_retry: recovery_retry(+80).',
        candidateScores: [{ filePath: 'src/b.ts', status: 'ready', score: 160, reasons: ['recovery_retry(+80)'] }],
      },
      lastChangeDiagnosis: {
        rootCauseType: 'incomplete_change',
        confidence: 0.71,
        evidence: ['validation_failed'],
        affectedFiles: ['src/b.ts'],
        nextAction: 'amend',
        recommendedAction: 'retry',
        shouldAmendPlan: true,
        shouldAbortPlan: false,
        confidenceBreakdown: {
          candidateScores: [{ rootCauseType: 'incomplete_change', score: 0.71, signals: ['validation_failed'] }],
          winnerMargin: 0.2,
          competition: {
            winner: { rootCauseType: 'incomplete_change', score: 0.71, signals: ['validation_failed'] },
            runnerUp: { rootCauseType: 'missed_dependency', score: 0.51, signals: ['impact_companion_or_reference_hit'] },
            winnerReason: 'winner=incomplete_change; winner_signals=validation_failed; margin=0.200',
            runnerUpReason: 'runner_up=missed_dependency; runner_up_signals=impact_companion_or_reference_hit; missing_winner_signals=validation_failed',
            whyNotRunnerUpReason: 'runner_up_lost_margin=0.200; disambiguation_signals=validation_failed; contested_signals=none',
            disambiguationSignals: ['validation_failed'],
            contestedSignals: [],
            conflicts: [
              {
                signal: 'validation_failed',
                winnerSupports: true,
                runnerUpSupports: false,
                resolution: 'favor_winner',
                reason: 'winner has stronger validation failure signal',
              },
            ],
          },
        },
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    const report = await primitives.reportStatus('auto', 'auto', ['auto'], ['auto'], ['auto'], 'auto')

    expect(report.status).toBe('in_progress')
    expect(report.summary).toContain('winnerReason=winner=incomplete_change')
    expect(report.summary).toContain('plannerReason=Planner selected src/b.ts')
    expect(report.nextStep).toContain('Planner selected src/b.ts via recovery_retry')
  })

  it('reportStatus(auto) remains in_progress when frontier still has executable nodes', async () => {
    const { runtime } = createRuntime({
      lastChangeReview: {
        status: 'ready_for_next_file',
        filesReviewed: ['src/a.ts'],
        diffSummary: '1 file changed',
        validationSummary: 'Validation passed',
        detectedRisks: [],
        unresolvedIssues: [],
        recommendedNextAction: 'all done',
      },
      currentPlanSession: {
        id: 'plan_report_frontier',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'active',
        amendCount: 0,
        backtrackCount: 0,
        maxAmendCount: 2,
        maxBacktrackCount: 1,
        maxFiles: 2,
        changeIntent: 'behavior_fix',
        steps: [
          { filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'validated', dependsOn: [], checkpoint: 'none' },
          { filePath: 'src/b.ts', intent: 'behavior_fix', source: 'search', status: 'ready', dependsOn: ['src/a.ts'], checkpoint: 'validation_required_before_next' },
        ],
        reason: 'report frontier status test',
      },
      currentPlanGraph: {
        version: 1,
        sessionId: 'plan_report_frontier',
        generatedAt: new Date().toISOString(),
        maxNodes: 2,
        maxNodesHardLimit: 5,
        amendBudget: { limit: 2, used: 0 },
        backtrackBudget: { limit: 1, used: 0 },
        taskNodes: [],
        subtaskNodes: [],
        nodes: [
          { id: 'node:src/a.ts', filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'validated', checkpoint: 'none', dependsOn: [], order: 0 },
          { id: 'node:src/b.ts', filePath: 'src/b.ts', intent: 'behavior_fix', source: 'search', status: 'ready', checkpoint: 'validation_required_before_next', dependsOn: ['node:src/a.ts'], order: 1 },
        ],
        edges: [],
      },
      lastPlanFrontier: {
        generatedAt: new Date().toISOString(),
        activeTaskNodeId: 'task:plan_report_frontier',
        readySubtaskIds: ['subtask:src/b.ts'],
        blockedSubtaskIds: [],
        readyNodeIds: ['node:src/b.ts'],
        blockedNodeIds: [],
        blockedReasons: [],
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    const report = await primitives.reportStatus('auto', 'auto', ['auto'], ['auto'], ['auto'], 'auto')

    expect(report.status).toBe('in_progress')
    expect(report.summary).toContain('src/b.ts')
    expect(report.nextStep).toContain('src/b.ts')
  })

  it('compressContext(auto) prioritizes planner decision for nextStepRecommendation', async () => {
    const { runtime } = createRuntime({
      lastPlannerDecision: {
        selectedFile: 'src/c.ts',
        selectionMode: 'follow_dependency_chain',
        decisionReason: 'Planner selected src/c.ts via follow_dependency_chain: follow_dependency_chain(+25).',
        candidateScores: [{ filePath: 'src/c.ts', status: 'ready', score: 90, reasons: ['follow_dependency_chain(+25)'] }],
      },
      recentEdits: [{ path: 'src/a.ts', summary: 'changed a' }],
    })

    const primitives = new CodingPrimitives(runtime as any)
    const snapshot = await primitives.compressContext('goal', 'auto', 'auto', 'auto', 'auto')
    expect(snapshot.nextStepRecommendation).toContain('Planner selected src/c.ts via follow_dependency_chain')
  })

  it('readFile(auto) resolves from lastTargetSelection.selectedFile when no planner conflict exists', async () => {
    const { runtime } = createRuntime({
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/target.ts',
        candidates: [],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
    })
    const primitives = new CodingPrimitives(runtime as any)

    vi.mocked(fs.readFile).mockResolvedValue('target content')
    const content = await primitives.readFile('auto')
    expect(content).toBe('target content')
    expect(fs.readFile).toHaveBeenCalledWith('/mock/workspace/root/src/target.ts', 'utf8')
  })

  it('readFile(auto) falls back to planner frontier when target selection is missing', async () => {
    const graph = buildPlanGraphFromSession({
      id: 'plan_read_file_frontier',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      amendCount: 0,
      backtrackCount: 0,
      maxAmendCount: 2,
      maxBacktrackCount: 1,
      maxFiles: 1,
      changeIntent: 'behavior_fix',
      steps: [
        { filePath: 'src/planned.ts', intent: 'behavior_fix', source: 'target_selection', status: 'ready', dependsOn: [], checkpoint: 'none' },
      ],
      reason: 'planner fallback',
    } as any)

    const { runtime } = createRuntime({
      currentPlanGraph: graph,
      lastPlanFrontier: {
        readyNodeIds: ['node:src/planned.ts'],
        blockedNodeIds: [],
      },
    })
    const primitives = new CodingPrimitives(runtime as any)

    vi.mocked(fs.readFile).mockResolvedValue('planned content')
    const content = await primitives.readFile('auto')

    expect(content).toBe('planned content')
    expect(fs.readFile).toHaveBeenCalledWith('/mock/workspace/root/src/planned.ts', 'utf8')
  })

  it('readFile(auto) prefers planner frontier ready node when last target is blocked', async () => {
    const graph = buildPlanGraphFromSession({
      id: 'plan_read_file_blocked',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      amendCount: 0,
      backtrackCount: 0,
      maxAmendCount: 2,
      maxBacktrackCount: 1,
      maxFiles: 2,
      changeIntent: 'behavior_fix',
      steps: [
        { filePath: 'src/stale.ts', intent: 'behavior_fix', source: 'target_selection', status: 'blocked_by_dependency', dependsOn: ['src/next.ts'], checkpoint: 'validation_required_before_next' },
        { filePath: 'src/next.ts', intent: 'behavior_fix', source: 'search', status: 'ready', dependsOn: [], checkpoint: 'none' },
      ],
      reason: 'prefer ready over blocked',
    } as any)

    const { runtime } = createRuntime({
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/stale.ts',
        candidates: [],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
      currentPlanGraph: graph,
      lastPlanFrontier: {
        readyNodeIds: ['node:src/next.ts'],
        blockedNodeIds: ['node:src/stale.ts'],
      },
    })
    const primitives = new CodingPrimitives(runtime as any)

    vi.mocked(fs.readFile).mockResolvedValue('next content')
    const content = await primitives.readFile('auto')

    expect(content).toBe('next content')
    expect(fs.readFile).toHaveBeenCalledWith('/mock/workspace/root/src/next.ts', 'utf8')
  })

  it('resolveScopedValidationCommand uses planner frontier target when explicit target is absent', async () => {
    const graph = buildPlanGraphFromSession({
      id: 'plan_scoped_validation_frontier',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      amendCount: 0,
      backtrackCount: 0,
      maxAmendCount: 2,
      maxBacktrackCount: 1,
      maxFiles: 1,
      changeIntent: 'behavior_fix',
      steps: [
        { filePath: 'src/planner.test.ts', intent: 'behavior_fix', source: 'target_selection', status: 'ready', dependsOn: [], checkpoint: 'none' },
      ],
      reason: 'planner scoped validation',
    } as any)

    const { runtime } = createRuntime({
      currentPlanGraph: graph,
      lastPlanFrontier: {
        readyNodeIds: ['node:src/planner.test.ts'],
        blockedNodeIds: [],
      },
    })
    const primitives = new CodingPrimitives(runtime as any)

    const scoped = await primitives.resolveScopedValidationCommand()
    expect(scoped.scope).toBe('file')
    expect(scoped.command).toContain('src/planner.test.ts')
    expect(scoped.reason).toContain('planner source: frontier_ready')
  })

  it('getPlannerWorkflowSignal recomputes frontier from graph when cached frontier is missing', () => {
    const graph = buildPlanGraphFromSession({
      id: 'plan_frontier_recompute',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      amendCount: 0,
      backtrackCount: 0,
      maxAmendCount: 2,
      maxBacktrackCount: 1,
      maxFiles: 1,
      changeIntent: 'behavior_fix',
      steps: [
        { filePath: 'src/recompute.ts', intent: 'behavior_fix', source: 'target_selection', status: 'ready', dependsOn: [], checkpoint: 'none' },
      ],
      reason: 'recompute frontier',
    } as any)

    const { runtime } = createRuntime({
      currentPlanGraph: graph,
      lastPlanFrontier: undefined,
    })
    const primitives = new CodingPrimitives(runtime as any)

    const signal = (primitives as any).getPlannerWorkflowSignal()
    expect(signal.selectedFile).toBe('src/recompute.ts')
    expect(signal.source).toBe('frontier_ready')

    const updateCalls = (runtime.stateManager.updateCodingState as any).mock.calls
    expect(updateCalls.some((call: any[]) => call[0]?.lastPlanFrontier)).toBe(true)
  })

  it('resolveScopedValidationCommand does not fallback to session step when graph exists but has no executable node', async () => {
    const graph = buildPlanGraphFromSession({
      id: 'plan_graph_only',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      amendCount: 0,
      backtrackCount: 0,
      maxAmendCount: 2,
      maxBacktrackCount: 1,
      maxFiles: 1,
      changeIntent: 'behavior_fix',
      steps: [
        { filePath: 'src/blocked.ts', intent: 'behavior_fix', source: 'target_selection', status: 'awaiting_checkpoint', dependsOn: [], checkpoint: 'validation_required_before_next' },
      ],
      reason: 'graph has no executable frontier',
    } as any)

    const { runtime } = createRuntime({
      currentPlanGraph: graph,
      lastPlanFrontier: {
        generatedAt: new Date().toISOString(),
        activeTaskNodeId: 'task:plan_graph_only',
        readySubtaskIds: [],
        blockedSubtaskIds: ['subtask:src/blocked.ts'],
        readyNodeIds: [],
        blockedNodeIds: ['node:src/blocked.ts'],
        blockedReasons: [{ nodeId: 'node:src/blocked.ts', reason: 'checkpoint_pending', details: ['validation_required_before_next'] }],
      },
      currentPlanSession: {
        id: 'plan_graph_only',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'active',
        amendCount: 0,
        backtrackCount: 0,
        maxAmendCount: 2,
        maxBacktrackCount: 1,
        maxFiles: 1,
        changeIntent: 'behavior_fix',
        steps: [{ filePath: 'src/session-fallback.ts', intent: 'behavior_fix', source: 'target_selection', status: 'in_progress' }],
        reason: 'graph should block session fallback',
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    const scoped = await primitives.resolveScopedValidationCommand()
    expect(scoped.scope).toBe('workspace')
    expect(scoped.command).toBe('pnpm typecheck')
  })

  it('searchText passes workspace root baseline and scoped search root separately', async () => {
    const { runtime } = createRuntime()
    const primitives = new CodingPrimitives(runtime as any)

    const spy = vi.spyOn(searchModule, 'searchText').mockResolvedValue({
      total: 0,
      matches: [],
    })

    await primitives.searchText('needle', 'src')

    expect(spy).toHaveBeenCalledWith('/mock/workspace/root', 'needle', {
      searchRoot: '/mock/workspace/root/src',
      glob: undefined,
      limit: 10,
    })
  })

  it('readFile(auto) fails when search result candidates are ambiguous', async () => {
    const { runtime } = createRuntime()
    const primitives = new CodingPrimitives(runtime as any)

    await expect(primitives.readFile('auto')).rejects.toThrow(McpError)
  })

  it('selectTarget succeeds with a single best candidate', async () => {
    const { runtime } = createRuntime({
      latestSearchMatchesBySource: {
        text: ['src/a.ts'],
      },
    })
    const primitives = new CodingPrimitives(runtime as any)

    const selection = await primitives.selectTarget({ searchQuery: 'needle' })
    expect(selection.status).toBe('selected')
    expect(selection.selectedFile).toBe('src/a.ts')
    expect(selection.targetKind).toBe('definition')
    expect(selection.evidenceChain?.length).toBeGreaterThan(0)
    expect(selection.competition?.winner?.filePath).toBe('src/a.ts')
    expect((selection.competition?.whyNotRunnerUp || '').length).toBeGreaterThan(0)
  })

  it('selectTarget resolves tie via target judgement winner when top two candidates tie on score', async () => {
    const { runtime } = createRuntime({
      latestSearchMatchesBySource: {
        text: ['src/a.ts', 'src/b.ts'],
      },
    })
    const primitives = new CodingPrimitives(runtime as any)

    const selection = await primitives.selectTarget({ searchQuery: 'needle' })
    expect(selection.status).toBe('selected')
    expect(selection.selectedFile).toBe('src/a.ts')
    expect(Array.isArray(selection.missingInformation)).toBe(true)
    expect((selection.missingInformation || []).length).toBeGreaterThan(0)
    expect(selection.competition?.winner?.filePath).toBe('src/a.ts')
    expect(selection.competition?.runnerUp?.filePath).toBe('src/b.ts')
  })

  it('selectTarget keeps references as supplementary evidence below symbol/text priority', async () => {
    const { runtime } = createRuntime({
      latestSearchMatchesBySource: {
        symbol: ['src/symbol.ts'],
        references: ['src/reference.ts'],
      },
    })
    const primitives = new CodingPrimitives(runtime as any)

    const selection = await primitives.selectTarget({ targetSymbol: 'foo' })
    expect(selection.status).toBe('selected')
    expect(selection.selectedFile).toBe('src/symbol.ts')
  })

  it('selectTarget ignores stale source kinds that were not requested in the current cycle', async () => {
    const { runtime } = createRuntime({
      latestSearchMatchesBySource: {
        symbol: ['src/old-symbol.ts'],
        text: ['src/current-text.ts'],
      },
    })
    const primitives = new CodingPrimitives(runtime as any)

    const selection = await primitives.selectTarget({ searchQuery: 'needle' })
    expect(selection.status).toBe('selected')
    expect(selection.selectedFile).toBe('src/current-text.ts')
  })

  it('selectTarget(session mode) consumes lastPlannerDecision before recomputing candidates', async () => {
    const { runtime } = createRuntime({
      lastPlannerDecision: {
        selectedFile: 'src/c.ts',
        selectionMode: 'dependency_ready',
        decisionReason: 'Planner selected src/c.ts via dependency_ready.',
        candidateScores: [
          { filePath: 'src/c.ts', status: 'ready', score: 60, reasons: ['dependencies_satisfied(+40)'] },
          { filePath: 'src/b.ts', status: 'ready', score: 60, reasons: ['dependencies_satisfied(+40)'] },
        ],
      },
      currentPlanSession: {
        id: 'plan_select_planner',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'active',
        amendCount: 0,
        backtrackCount: 0,
        maxAmendCount: 2,
        maxBacktrackCount: 1,
        maxFiles: 3,
        changeIntent: 'behavior_fix',
        steps: [
          { filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'validated', dependsOn: [], checkpoint: 'none' },
          { filePath: 'src/b.ts', intent: 'behavior_fix', source: 'search', status: 'ready', dependsOn: ['src/a.ts'], checkpoint: 'validation_required_before_next' },
          { filePath: 'src/c.ts', intent: 'behavior_fix', source: 'search', status: 'ready', dependsOn: ['src/a.ts'], checkpoint: 'validation_required_before_next' },
        ],
        reason: 'test',
      },
    })
    const primitives = new CodingPrimitives(runtime as any)

    const selection = await primitives.selectTarget({ changeIntent: 'behavior_fix' })
    expect(selection.status).toBe('selected')
    expect(selection.selectedFile).toBe('src/c.ts')
    expect(selection.reason).toContain('Planner selected src/c.ts')
    expect(selection.targetKind).toBe('definition')
    expect(selection.competition?.winner?.filePath).toBe('src/c.ts')
    expect((selection.competition?.whyNotRunnerUp || '').length).toBeGreaterThan(0)
  })

  it('planChanges creates single-file and dual-file plans under limit 2', async () => {
    const single = createRuntime({
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/a.ts',
        candidates: [{ filePath: 'src/a.ts' }],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
    })
    const singlePrimitives = new CodingPrimitives(single.runtime as any)
    const singlePlan = await singlePrimitives.planChanges({ intent: 'single', allowMultiFile: false })
    expect(singlePlan.steps).toHaveLength(1)

    const dual = createRuntime({
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/a.ts',
        candidates: [{ filePath: 'src/a.ts' }, { filePath: 'src/b.ts' }, { filePath: 'src/c.ts' }],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
    })
    const dualPrimitives = new CodingPrimitives(dual.runtime as any)
    const dualPlan = await dualPrimitives.planChanges({ intent: 'dual', allowMultiFile: true, maxPlannedFiles: 2 })
    expect(dualPlan.steps.map(step => step.filePath)).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('planChanges supports constrained 3-file dependsOn/checkpoint chain', async () => {
    const { runtime } = createRuntime({
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/a.ts',
        candidates: [{ filePath: 'src/a.ts' }, { filePath: 'src/b.ts' }, { filePath: 'src/c.ts' }],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    const plan = await primitives.planChanges({
      intent: 'triple',
      allowMultiFile: true,
      maxPlannedFiles: 3,
    })

    const deterministicPlan = plan as any
    expect(deterministicPlan.maxPlannedFiles).toBe(3)
    expect(deterministicPlan.steps.map((step: any) => step.filePath)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts'])
    expect(deterministicPlan.steps[0]?.dependsOn).toEqual([])
    expect(deterministicPlan.steps[0]?.checkpoint).toBe('none')
    expect(deterministicPlan.steps[1]?.dependsOn).toEqual(['src/a.ts'])
    expect(deterministicPlan.steps[1]?.checkpoint).toBe('validation_required_before_next')
    expect(deterministicPlan.steps[2]?.dependsOn).toEqual(['src/b.ts'])
    expect(deterministicPlan.steps[2]?.checkpoint).toBe('validation_required_before_next')
  })

  it('planChanges rejects duplicate file entries in one plan', async () => {
    const { runtime } = createRuntime({
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/a.ts',
        candidates: [{ filePath: 'src/a.ts' }, { filePath: 'src/b.ts' }, { filePath: 'src/b.ts' }],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    await expect(primitives.planChanges({ intent: 'dup', allowMultiFile: true, maxPlannedFiles: 2 })).rejects.toThrow(McpError)
  })

  it('reviewChanges flags validation_failed and unexpected_files_touched deterministically', async () => {
    const { runtime } = createRuntime({
      recentEdits: [
        { path: 'src/a.ts', summary: 'edited planned file' },
        { path: 'src/unexpected.ts', summary: 'edited unplanned file' },
      ],
      currentPlan: {
        maxPlannedFiles: 2,
        diffBaselineFiles: [],
        reason: 'plan',
        steps: [
          { filePath: 'src/a.ts', intent: 'fix', source: 'target_selection', status: 'pending' },
          { filePath: 'src/b.ts', intent: 'fix', source: 'search', status: 'pending' },
        ],
      },
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/a.ts',
        candidates: [{ filePath: 'src/a.ts' }, { filePath: 'src/b.ts' }],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
    }, {
      lastTerminalResult: {
        command: 'pnpm test',
        exitCode: 1,
        stdout: '',
        stderr: 'failed',
        effectiveCwd: '/mock/workspace/root',
        durationMs: 20,
        timedOut: false,
      },
    })
    const primitives = new CodingPrimitives(runtime as any)
    vi.spyOn(primitives as any, 'listDiffFiles').mockResolvedValue(['src/a.ts', 'src/unexpected.ts'])
    vi.spyOn(primitives as any, 'readDiffStat').mockResolvedValue(' src/a.ts | 1 +\n')
    const review = await primitives.reviewChanges({})

    expect(review.detectedRisks).toContain('validation_failed')
    expect(review.detectedRisks, JSON.stringify(review.detectedRisks)).toContain('unexpected_files_touched')
  })

  it('reviewChanges flags no_validation_run and unresolved_issues_remain when applicable', async () => {
    const { runtime } = createRuntime({
      pendingIssues: ['manual issue'],
      currentPlan: {
        maxPlannedFiles: 1,
        diffBaselineFiles: [],
        reason: 'plan',
        steps: [{ filePath: 'src/a.ts', intent: 'fix', source: 'target_selection', status: 'pending' }],
      },
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/a.ts',
        candidates: [{ filePath: 'src/a.ts' }],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
    })
    const primitives = new CodingPrimitives(runtime as any)
    vi.spyOn(primitives as any, 'listDiffFiles').mockResolvedValue([])
    vi.spyOn(primitives as any, 'readDiffStat').mockResolvedValue(' src/a.ts | 1 +\n')
    const review = await primitives.reviewChanges({})

    expect(review.detectedRisks).toContain('no_validation_run')
    expect(review.detectedRisks).toContain('unresolved_issues_remain')
  })

  it('reviewChanges does not infer unexpected files from stale recentEdits outside the current diff', async () => {
    const { runtime } = createRuntime({
      recentEdits: [
        { path: 'src/a.ts', summary: 'current plan file' },
        { path: 'src/stale.ts', summary: 'old unrelated edit' },
      ],
      currentPlan: {
        maxPlannedFiles: 1,
        diffBaselineFiles: [],
        reason: 'plan',
        steps: [{ filePath: 'src/a.ts', intent: 'fix', source: 'target_selection', status: 'pending' }],
      },
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/a.ts',
        candidates: [{ filePath: 'src/a.ts' }],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
    }, {
      lastTerminalResult: {
        command: 'pnpm test',
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
        effectiveCwd: '/mock/workspace/root',
        durationMs: 10,
        timedOut: false,
      },
    })
    const primitives = new CodingPrimitives(runtime as any)
    vi.spyOn(primitives as any, 'listDiffFiles').mockResolvedValue([])
    vi.spyOn(primitives as any, 'readDiffStat').mockResolvedValue(' src/a.ts | 1 +\n')
    const review = await primitives.reviewChanges({})

    expect(review.detectedRisks).not.toContain('unexpected_files_touched')
    expect(review.detectedRisks).not.toContain('patch_verification_mismatch')
  })

  it('reviewChanges marks baselineComparison as new_red when failure signature drifts', async () => {
    const { runtime } = createRuntime({
      recentEdits: [{ path: 'src/a.ts', summary: 'edited current file' }],
      currentPlan: {
        maxPlannedFiles: 1,
        diffBaselineFiles: [],
        reason: 'plan',
        steps: [{ filePath: 'src/a.ts', intent: 'fix', source: 'target_selection', status: 'pending' }],
      },
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/a.ts',
        candidates: [{ filePath: 'src/a.ts' }],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
      validationBaseline: {
        capturedAt: new Date().toISOString(),
        workspacePath: '/mock/workspace/root',
        baselineDirtyFiles: ['src/a.ts'],
        baselineDiffSummary: '1 file changed',
        baselineFailingChecks: ['pnpm test (exit 1)'],
        baselineFailureSignature: 'error: baseline only',
        baselineFailingTests: ['src/a.test.ts > should stay red'],
        baselineSkippedValidations: [],
        workspaceMetadata: { gitAvailable: true },
      },
    }, {
      lastTerminalResult: {
        command: 'pnpm test',
        exitCode: 1,
        stdout: '',
        stderr: 'FAIL src/b.test.ts > brand new regression',
        effectiveCwd: '/mock/workspace/root',
        durationMs: 12,
        timedOut: false,
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    vi.spyOn(primitives as any, 'listDiffFiles').mockResolvedValue(['src/a.ts'])
    vi.spyOn(primitives as any, 'readDiffStat').mockResolvedValue(' src/a.ts | 1 +\n')

    const review = await primitives.reviewChanges({})
    expect(review.baselineComparison).toBe('new_red')
  })

  it('reviewChanges marks baselineComparison as baseline_noise when failing test-set matches within baseline diff', async () => {
    const { runtime } = createRuntime({
      recentEdits: [{ path: 'src/a.ts', summary: 'edited current file' }],
      currentPlan: {
        maxPlannedFiles: 1,
        diffBaselineFiles: [],
        reason: 'plan',
        steps: [{ filePath: 'src/a.ts', intent: 'fix', source: 'target_selection', status: 'pending' }],
      },
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/a.ts',
        candidates: [{ filePath: 'src/a.ts' }],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
      validationBaseline: {
        capturedAt: new Date().toISOString(),
        workspacePath: '/mock/workspace/root',
        baselineDirtyFiles: ['src/a.ts'],
        baselineDiffSummary: '1 file changed',
        baselineFailingChecks: ['pnpm test (exit 1)'],
        baselineFailingTests: ['src/a.test.ts > should stay red'],
        baselineSkippedValidations: [],
        workspaceMetadata: { gitAvailable: true },
      },
    }, {
      lastTerminalResult: {
        command: 'pnpm test',
        exitCode: 1,
        stdout: '',
        stderr: 'FAIL src/a.test.ts > should stay red',
        effectiveCwd: '/mock/workspace/root',
        durationMs: 12,
        timedOut: false,
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    vi.spyOn(primitives as any, 'listDiffFiles').mockResolvedValue(['src/a.ts'])
    vi.spyOn(primitives as any, 'readDiffStat').mockResolvedValue(' src/a.ts | 1 +\n')

    const review = await primitives.reviewChanges({})
    expect(review.baselineComparison).toBe('baseline_noise')
  })

  it('reviewChanges marks baselineComparison as new_red when test-set overlaps but signature drifts and diff escapes baseline', async () => {
    const { runtime } = createRuntime({
      recentEdits: [{ path: 'src/a.ts', summary: 'edited current file' }],
      currentPlan: {
        maxPlannedFiles: 1,
        diffBaselineFiles: [],
        reason: 'plan',
        steps: [{ filePath: 'src/a.ts', intent: 'fix', source: 'target_selection', status: 'pending' }],
      },
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/a.ts',
        candidates: [{ filePath: 'src/a.ts' }],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
      validationBaseline: {
        capturedAt: new Date().toISOString(),
        workspacePath: '/mock/workspace/root',
        baselineDirtyFiles: ['src/a.ts'],
        baselineDiffSummary: '1 file changed',
        baselineFailingChecks: ['pnpm test (exit 1)'],
        baselineFailureSignature: 'fail src/a.test.ts > should stay red | error: baseline stack at src/a.ts:#:#',
        baselineFailingTests: ['src/a.test.ts > should stay red'],
        baselineSkippedValidations: [],
        workspaceMetadata: { gitAvailable: true },
      },
    }, {
      lastTerminalResult: {
        command: 'pnpm test',
        exitCode: 1,
        stdout: '',
        stderr: 'FAIL src/a.test.ts > should stay red\nError: drift stack at src/companion.ts:9:9',
        effectiveCwd: '/mock/workspace/root',
        durationMs: 12,
        timedOut: false,
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    vi.spyOn(primitives as any, 'listDiffFiles').mockResolvedValue(['src/a.ts', 'src/companion.ts'])
    vi.spyOn(primitives as any, 'readDiffStat').mockResolvedValue(' src/a.ts | 1 +\n src/companion.ts | 1 +\n')

    const review = await primitives.reviewChanges({})
    expect(review.baselineComparison).toBe('new_red')
  })

  it('reviewChanges flags baseline_diff_escape when failing diff exceeds captured baseline dirty set', async () => {
    const { runtime } = createRuntime({
      recentEdits: [{ path: 'src/a.ts', summary: 'edited current file' }],
      currentPlan: {
        maxPlannedFiles: 1,
        diffBaselineFiles: [],
        reason: 'plan',
        steps: [{ filePath: 'src/a.ts', intent: 'fix', source: 'target_selection', status: 'pending' }],
      },
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/a.ts',
        candidates: [{ filePath: 'src/a.ts' }],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
      validationBaseline: {
        capturedAt: new Date().toISOString(),
        workspacePath: '/mock/workspace/root',
        baselineDirtyFiles: ['src/a.ts'],
        baselineDiffSummary: '1 file changed',
        baselineFailingChecks: ['pnpm test (exit 1)'],
        baselineFailingTests: ['src/a.test.ts > should stay red'],
        baselineSkippedValidations: [],
        workspaceMetadata: { gitAvailable: true },
      },
    }, {
      lastTerminalResult: {
        command: 'pnpm test',
        exitCode: 1,
        stdout: '',
        stderr: 'FAIL src/a.test.ts > should stay red\nError: drift at src/companion.ts:9:9',
        effectiveCwd: '/mock/workspace/root',
        durationMs: 12,
        timedOut: false,
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    vi.spyOn(primitives as any, 'listDiffFiles').mockResolvedValue(['src/a.ts', 'src/companion.ts'])
    vi.spyOn(primitives as any, 'readDiffStat').mockResolvedValue(' src/a.ts | 1 +\n src/companion.ts | 1 +\n')

    const review = await primitives.reviewChanges({})
    expect(review.baselineComparison).toBe('new_red')
    expect(review.detectedRisks).toContain('baseline_diff_escape')
  })

  it('reviewChanges avoids baseline_noise fallback when baseline lacks signatures/tests', async () => {
    const { runtime } = createRuntime({
      recentEdits: [{ path: 'src/a.ts', summary: 'edited current file' }],
      currentPlan: {
        maxPlannedFiles: 1,
        diffBaselineFiles: [],
        reason: 'plan',
        steps: [{ filePath: 'src/a.ts', intent: 'fix', source: 'target_selection', status: 'pending' }],
      },
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/a.ts',
        candidates: [{ filePath: 'src/a.ts' }],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
      validationBaseline: {
        capturedAt: new Date().toISOString(),
        workspacePath: '/mock/workspace/root',
        baselineDirtyFiles: ['src/a.ts'],
        baselineDiffSummary: '1 file changed',
        baselineFailingChecks: ['pnpm test (exit 1)'],
        baselineSkippedValidations: [],
        workspaceMetadata: { gitAvailable: true },
      },
    }, {
      lastTerminalResult: {
        command: 'pnpm test',
        exitCode: 1,
        stdout: '',
        stderr: 'Validation crashed without structured failing test tokens',
        effectiveCwd: '/mock/workspace/root',
        durationMs: 12,
        timedOut: false,
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    vi.spyOn(primitives as any, 'listDiffFiles').mockResolvedValue(['src/a.ts'])
    vi.spyOn(primitives as any, 'readDiffStat').mockResolvedValue(' src/a.ts | 1 +\n')

    const review = await primitives.reviewChanges({})
    expect(review.baselineComparison).toBe('new_red')
  })

  it('reviewWorkspace resets workspace-scoped search and plan state when switching roots', async () => {
    const { runtime, getCodingState } = createRuntime({
      workspacePath: '/mock/workspace/old',
      recentReads: [{ path: 'src/old.ts', range: 'all' }],
      recentEdits: [{ path: 'src/old.ts', summary: 'old edit' }],
      recentCommandResults: ['Command: old'],
      recentSearches: ['Text search: old'],
      latestSearchMatchesBySource: { text: ['src/old.ts'] },
      targetCandidates: [{ filePath: 'src/old.ts' }],
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/old.ts',
        candidates: [{ filePath: 'src/old.ts' }],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
      currentPlan: {
        maxPlannedFiles: 1,
        diffBaselineFiles: [],
        reason: 'old plan',
        steps: [{ filePath: 'src/old.ts', intent: 'fix', source: 'target_selection', status: 'pending' }],
      },
      lastChangeReview: {
        status: 'ready_for_next_file',
        filesReviewed: ['src/old.ts'],
        diffSummary: 'old diff',
        validationSummary: 'old validation',
        detectedRisks: [],
        unresolvedIssues: [],
        recommendedNextAction: 'done',
      },
      lastScopedTargetPath: 'src',
    })
    const primitives = new CodingPrimitives(runtime as any)

    await primitives.reviewWorkspace('/mock/workspace/new')
    const codingState = getCodingState()

    expect(codingState.workspacePath).toBe('/mock/workspace/new')
    expect(codingState.recentReads).toEqual([])
    expect(codingState.recentEdits).toEqual([])
    expect(codingState.recentCommandResults).toEqual([])
    expect(codingState.recentSearches).toEqual([])
    expect(codingState.latestSearchMatchesBySource).toEqual({})
    expect(codingState.targetCandidates).toBeUndefined()
    expect(codingState.lastTargetSelection).toBeUndefined()
    expect(codingState.lastTargetDecisionCase).toBeUndefined()
    expect(codingState.lastTargetJudgement).toBeUndefined()
    expect(codingState.currentPlan).toBeUndefined()
    expect(codingState.currentPlanGraph).toBeUndefined()
    expect(codingState.lastPlanFrontier).toBeUndefined()
    expect(codingState.lastPlanDraft).toBeUndefined()
    expect(codingState.lastChangeReview).toBeUndefined()
    expect(codingState.lastDiagnosisCase).toBeUndefined()
    expect(codingState.lastDiagnosisJudgement).toBeUndefined()
    expect(codingState.lastScopedTargetPath).toBeUndefined()
  })

  it('analyzeImpact returns unsupported for non JS/TS target files', async () => {
    const { runtime } = createRuntime()
    const primitives = new CodingPrimitives(runtime as any)

    const result = await primitives.analyzeImpact({
      targetFile: 'README.md',
      searchQuery: 'TODO',
    })

    expect(result.status).toBe('unsupported')
    expect(result.languageSupport).toBe('unsupported')
  })

  it('validateHypothesis returns validated hypothesis for deterministic candidate', async () => {
    const { runtime } = createRuntime({
      latestSearchMatchesBySource: {
        text: ['src/a.ts'],
      },
    })
    const primitives = new CodingPrimitives(runtime as any)

    const result = await primitives.validateHypothesis({
      searchQuery: 'needle',
      changeIntent: 'behavior_fix',
    })

    expect(result.status).toBe('validated')
    expect(result.selectedHypothesis?.filePath).toBe('src/a.ts')
  })

  it('planChanges(sessionAware) creates bounded plan session with in_progress first step', async () => {
    const { runtime } = createRuntime({
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/a.ts',
        candidates: [{ filePath: 'src/a.ts' }, { filePath: 'src/b.ts' }],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    const session = await primitives.planChanges({
      intent: 'agentic-plan',
      sessionAware: true,
      changeIntent: 'behavior_fix',
      maxPlannedFiles: 2,
    })

    expect(session).toMatchObject({
      status: 'active',
      changeIntent: 'behavior_fix',
    })
    expect((session as any).steps[0].status).toBe('in_progress')
    expect((session as any).steps).toHaveLength(2)
  })

  it('planChanges(sessionAware) keeps constrained dependency/checkpoint metadata for 3-file plan', async () => {
    const { runtime } = createRuntime({
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/a.ts',
        candidates: [{ filePath: 'src/a.ts' }, { filePath: 'src/b.ts' }, { filePath: 'src/c.ts' }],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    const session = await primitives.planChanges({
      intent: 'agentic-triple',
      sessionAware: true,
      changeIntent: 'behavior_fix',
      maxPlannedFiles: 3,
    })

    expect((session as any).maxFiles).toBe(3)
    expect((session as any).steps).toHaveLength(3)
    expect((session as any).steps[1].dependsOn).toEqual(['src/a.ts'])
    expect((session as any).steps[2].dependsOn).toEqual(['src/b.ts'])
    expect((session as any).steps[1].checkpoint).toBe('validation_required_before_next')
    expect((session as any).steps[2].checkpoint).toBe('validation_required_before_next')
  })

  it('planChanges(sessionAware) clears stale lastPlannerDecision when session has no executable candidates', async () => {
    const { runtime } = createRuntime({
      lastPlannerDecision: {
        selectedFile: 'src/old.ts',
        selectionMode: 'dependency_ready',
        decisionReason: 'stale planner decision',
        candidateScores: [{ filePath: 'src/old.ts', status: 'ready', score: 10, reasons: ['stale'] }],
      },
      currentPlanSession: {
        id: 'plan_session_done',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'active',
        amendCount: 0,
        backtrackCount: 0,
        maxAmendCount: 2,
        maxBacktrackCount: 1,
        maxFiles: 1,
        changeIntent: 'behavior_fix',
        steps: [{ filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'validated', dependsOn: [], checkpoint: 'none' }],
        reason: 'already completed session',
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    await primitives.planChanges({
      intent: 'reuse existing session',
      sessionAware: true,
      changeIntent: 'behavior_fix',
    })

    expect(runtime.stateManager.getState().coding?.lastPlannerDecision).toBeUndefined()
  })

  it('planner decision prefers in_progress step over newly ready steps', async () => {
    const { runtime } = createRuntime()
    const primitives = new CodingPrimitives(runtime as any)

    const session = {
      id: 'planner_1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      amendCount: 0,
      backtrackCount: 0,
      maxAmendCount: 2,
      maxBacktrackCount: 1,
      maxFiles: 3,
      changeIntent: 'behavior_fix',
      steps: [
        { filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'validated', dependsOn: [], checkpoint: 'none' },
        { filePath: 'src/b.ts', intent: 'behavior_fix', source: 'search', status: 'in_progress', dependsOn: ['src/a.ts'], checkpoint: 'validation_required_before_next' },
        { filePath: 'src/c.ts', intent: 'behavior_fix', source: 'search', status: 'ready', dependsOn: ['src/a.ts'], checkpoint: 'validation_required_before_next' },
      ],
      reason: 'planner test',
    } as any

    const decision = (primitives as any).buildPlannerDecision(session)
    expect(decision.selectedFile).toBe('src/b.ts')
    expect(decision.selectionMode).toBe('resume_current')
  })

  it('planner decision prioritizes recovery_retry step after needs_replan -> ready transition', async () => {
    const { runtime } = createRuntime()
    const primitives = new CodingPrimitives(runtime as any)

    const previousSession = {
      id: 'planner_2_prev',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'investigating',
      amendCount: 0,
      backtrackCount: 0,
      maxAmendCount: 2,
      maxBacktrackCount: 1,
      maxFiles: 3,
      changeIntent: 'behavior_fix',
      steps: [
        { filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'validated', dependsOn: [], checkpoint: 'none' },
        { filePath: 'src/b.ts', intent: 'behavior_fix', source: 'search', status: 'needs_replan', dependsOn: ['src/a.ts'], checkpoint: 'validation_required_before_next' },
        { filePath: 'src/c.ts', intent: 'behavior_fix', source: 'search', status: 'ready', dependsOn: ['src/a.ts'], checkpoint: 'validation_required_before_next' },
      ],
      reason: 'planner test prev',
    } as any

    const currentSession = {
      ...previousSession,
      id: 'planner_2_curr',
      status: 'amended',
      steps: [
        { filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'validated', dependsOn: [], checkpoint: 'none' },
        { filePath: 'src/b.ts', intent: 'behavior_fix', source: 'search', status: 'ready', dependsOn: ['src/a.ts'], checkpoint: 'validation_required_before_next' },
        { filePath: 'src/c.ts', intent: 'behavior_fix', source: 'search', status: 'ready', dependsOn: ['src/a.ts'], checkpoint: 'validation_required_before_next' },
      ],
    } as any

    const decision = (primitives as any).buildPlannerDecision(currentSession, previousSession)
    expect(decision.selectedFile).toBe('src/b.ts')
    expect(decision.selectionMode).toBe('recovery_retry')
  })

  it('planner decision excludes dependency-unsatisfied steps from candidate pool', async () => {
    const { runtime } = createRuntime()
    const primitives = new CodingPrimitives(runtime as any)

    const session = {
      id: 'planner_3',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      amendCount: 0,
      backtrackCount: 0,
      maxAmendCount: 2,
      maxBacktrackCount: 1,
      maxFiles: 3,
      changeIntent: 'behavior_fix',
      steps: [
        { filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'ready', dependsOn: [], checkpoint: 'none' },
        { filePath: 'src/b.ts', intent: 'behavior_fix', source: 'search', status: 'ready', dependsOn: ['src/c.ts'], checkpoint: 'validation_required_before_next' },
        { filePath: 'src/c.ts', intent: 'behavior_fix', source: 'search', status: 'ready', dependsOn: ['src/a.ts'], checkpoint: 'validation_required_before_next' },
      ],
      reason: 'planner deps test',
    } as any

    const decision = (primitives as any).buildPlannerDecision(session)
    const candidateFiles = decision.candidateScores.map((candidate: any) => candidate.filePath)
    expect(candidateFiles).not.toContain('src/b.ts')
  })

  it('planner decision uses deterministic conservative tie-break when top candidates tie', async () => {
    const { runtime } = createRuntime()
    const primitives = new CodingPrimitives(runtime as any)

    const session = {
      id: 'planner_4',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      amendCount: 0,
      backtrackCount: 0,
      maxAmendCount: 2,
      maxBacktrackCount: 1,
      maxFiles: 2,
      changeIntent: 'behavior_fix',
      steps: [
        { filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'ready', dependsOn: [], checkpoint: 'none' },
        { filePath: 'src/b.ts', intent: 'behavior_fix', source: 'search', status: 'ready', dependsOn: [], checkpoint: 'none' },
      ],
      reason: 'planner tie test',
    } as any

    const decision = (primitives as any).buildPlannerDecision(session, undefined, 'src/b.ts')
    expect(decision.selectedFile).toBe('src/b.ts')
  })

  it('reviewChanges mirrors graph-backed plan when currentPlan is absent', async () => {
    const currentPlanSession = {
      id: 'plan_session_1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      amendCount: 0,
      backtrackCount: 0,
      maxAmendCount: 2,
      maxBacktrackCount: 1,
      maxFiles: 1,
      changeIntent: 'behavior_fix',
      steps: [{ filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'in_progress' }],
      reason: 'session only',
    } as any

    const { runtime } = createRuntime({
      recentEdits: [{ path: 'src/a.ts', summary: 'edited current session file' }],
      currentPlanSession,
      currentPlanGraph: buildPlanGraphFromSession(currentPlanSession),
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/a.ts',
        candidates: [{ filePath: 'src/a.ts' }],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
    }, {
      lastTerminalResult: {
        command: 'pnpm test',
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
        effectiveCwd: '/mock/workspace/root',
        durationMs: 10,
        timedOut: false,
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    vi.spyOn(primitives as any, 'listDiffFiles').mockResolvedValue(['src/a.ts'])
    vi.spyOn(primitives as any, 'readDiffStat').mockResolvedValue(' src/a.ts | 1 +\n')

    const review = await primitives.reviewChanges({})

    expect(runtime.stateManager.getState().coding?.currentPlan?.steps[0]?.filePath).toBe('src/a.ts')
    expect(Array.isArray(review.detectedRisks)).toBe(true)
    expect(runtime.stateManager.getState().coding?.currentPlanSession).toBeDefined()
  })

  it('reviewChanges exposes nextExecutableFile/Reason from graph-backed planner decision', async () => {
    const currentPlanSession = {
      id: 'plan_session_next_ref',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      amendCount: 0,
      backtrackCount: 0,
      maxAmendCount: 2,
      maxBacktrackCount: 1,
      maxFiles: 2,
      changeIntent: 'behavior_fix',
      steps: [
        { filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'in_progress', dependsOn: [], checkpoint: 'none' },
        { filePath: 'src/b.ts', intent: 'behavior_fix', source: 'search', status: 'blocked_by_dependency', dependsOn: ['src/a.ts'], checkpoint: 'validation_required_before_next' },
      ],
      reason: 'session review decision',
    } as any

    const { runtime } = createRuntime({
      recentEdits: [{ path: 'src/a.ts', summary: 'edited current session file' }],
      currentPlanSession,
      currentPlanGraph: buildPlanGraphFromSession(currentPlanSession),
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/a.ts',
        candidates: [{ filePath: 'src/a.ts' }, { filePath: 'src/b.ts' }],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
    }, {
      lastTerminalResult: {
        command: 'pnpm test',
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
        effectiveCwd: '/mock/workspace/root',
        durationMs: 10,
        timedOut: false,
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    vi.spyOn(primitives as any, 'listDiffFiles').mockResolvedValue(['src/a.ts'])
    vi.spyOn(primitives as any, 'readDiffStat').mockResolvedValue(' src/a.ts | 1 +\n')

    const review = await primitives.reviewChanges({ currentFilePath: 'src/a.ts' })

    expect(review.nextExecutableFile).toBe('src/a.ts')
    expect((review.nextExecutableReason || '').length).toBeGreaterThan(0)
    expect(review.plannerDecisionRef?.selectedFile).toBe('src/a.ts')
    expect((review.plannerDecisionRef?.decisionReason || '').length).toBeGreaterThan(0)
  })

  it('diagnoseChanges classifies patch mismatch as wrong_target and lets counterfactual decide amend/continue priority', async () => {
    const { runtime } = createRuntime({
      lastChangeReview: {
        status: 'blocked',
        filesReviewed: ['src/a.ts'],
        diffSummary: '1 file changed',
        validationSummary: 'Validation passed',
        detectedRisks: ['patch_verification_mismatch'],
        unresolvedIssues: [],
        recommendedNextAction: 'Fix target',
      },
      currentPlanSession: {
        id: 'plan_1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'investigating',
        amendCount: 0,
        backtrackCount: 0,
        maxAmendCount: 2,
        maxBacktrackCount: 1,
        maxFiles: 1,
        changeIntent: 'behavior_fix',
        steps: [{ filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'needs_replan' }],
        reason: 'test',
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    const diagnosis = await primitives.diagnoseChanges({})

    expect(diagnosis.rootCauseType).toBe('wrong_target')
    expect(['amend', 'continue']).toContain(diagnosis.nextAction)
    expect(diagnosis.shouldAbortPlan).toBe(false)
    if (diagnosis.nextAction === 'continue') {
      expect(diagnosis.evidence.some(item => item.includes('counterfactual_priority_action'))).toBe(true)
    }
    expect(diagnosis.confidenceBreakdown?.competition?.winner?.rootCauseType).toBe('wrong_target')
    expect(['missed_dependency', 'validation_command_mismatch', 'incomplete_change']).toContain(
      diagnosis.confidenceBreakdown?.competition?.runnerUp?.rootCauseType,
    )
    expect((diagnosis.confidenceBreakdown?.competition?.disambiguationSignals || []).length).toBeGreaterThan(0)
    expect((diagnosis.confidenceBreakdown?.competition?.whyNotRunnerUpReason || '').length).toBeGreaterThan(0)
    expect((diagnosis.confidenceBreakdown?.competition?.conflicts || []).length).toBeGreaterThan(0)
    expect(Array.isArray(diagnosis.contestedSignals)).toBe(true)
    expect(Array.isArray(diagnosis.conflictingEvidence)).toBe(true)
    expect(Array.isArray(diagnosis.counterfactualChecks)).toBe(true)
    expect((diagnosis.counterfactualChecks || []).length).toBeGreaterThan(0)
    expect(diagnosis.recommendedRepairWindow?.scope).toBe('current_file')
    const updated = runtime.stateManager.getState().coding?.currentPlanSession
    expect(['amended', 'active']).toContain(updated?.status)
    expect(runtime.stateManager.getState().coding?.lastDiagnosisCompetition?.winner?.rootCauseType).toBe('wrong_target')
    expect(runtime.stateManager.getState().coding?.lastDiagnosisJudgeInput?.taskIntent).toBe('behavior_fix')
    expect((runtime.stateManager.getState().coding?.lastDiagnosisJudgeInput?.candidateRootCauses || []).length).toBeGreaterThan(1)
    expect(runtime.stateManager.getState().coding?.lastDiagnosisJudgeInput?.competition?.winner?.rootCauseType).toBe('wrong_target')
    expect(runtime.stateManager.getState().coding?.lastReplanDraftInput?.diagnosis?.rootCauseType).toBe('wrong_target')
    expect(runtime.stateManager.getState().coding?.lastReplanDraftInput?.planBudget?.maxFiles).toBe(1)
    expect(runtime.stateManager.getState().coding?.lastDiagnosisCase?.currentNode).toBe('src/a.ts')
    expect(runtime.stateManager.getState().coding?.lastDiagnosisJudgement?.winner).toBe('wrong_target')
    expect(Array.isArray(runtime.stateManager.getState().coding?.lastDiagnosisJudgement?.counterfactualChecks)).toBe(true)
    expect((runtime.stateManager.getState().coding?.lastDiagnosisJudgement?.counterfactualChecks || []).length).toBeGreaterThan(0)
    expect(runtime.stateManager.getState().coding?.lastCausalTrace?.rootCauseType).toBe('wrong_target')
    expect(Array.isArray(runtime.stateManager.getState().coding?.lastCausalTrace?.nodes)).toBe(true)
    expect((runtime.stateManager.getState().coding?.lastCausalTrace?.nodes || []).length).toBeGreaterThan(0)
    expect(Array.isArray(runtime.stateManager.getState().coding?.lastCausalTrace?.edges)).toBe(true)
    expect((runtime.stateManager.getState().coding?.lastCausalTrace?.edges || []).length).toBeGreaterThan(0)
    expect(Array.isArray(runtime.stateManager.getState().coding?.causalTraceLog)).toBe(true)
    expect((runtime.stateManager.getState().coding?.causalTraceLog || []).length).toBeGreaterThan(0)
    expect(runtime.stateManager.getState().coding?.lastPlanDraft?.nodes?.length).toBeGreaterThan(0)
    expect(runtime.stateManager.getState().coding?.lastPlanDraft?.nodes?.length).toBeLessThanOrEqual(3)
  })

  it('diagnoseChanges keeps planner on recovery target when wrong_target competes with in_progress alternatives', async () => {
    const { runtime } = createRuntime({
      lastChangeReview: {
        status: 'blocked',
        filesReviewed: ['src/a.ts'],
        diffSummary: '1 file changed',
        validationSummary: 'Validation passed',
        detectedRisks: ['patch_verification_mismatch'],
        unresolvedIssues: [],
        recommendedNextAction: 'Fix target',
      },
      currentPlanSession: {
        id: 'plan_wrong_target_constraint',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'investigating',
        amendCount: 0,
        backtrackCount: 0,
        maxAmendCount: 2,
        maxBacktrackCount: 1,
        maxFiles: 3,
        changeIntent: 'behavior_fix',
        steps: [
          { filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'needs_replan', dependsOn: [], checkpoint: 'none' },
          { filePath: 'src/b.ts', intent: 'behavior_fix', source: 'search', status: 'in_progress', dependsOn: [], checkpoint: 'none' },
        ],
        reason: 'force wrong_target planner constraint',
      },
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/a.ts',
        candidates: [{ filePath: 'src/a.ts' }, { filePath: 'src/b.ts' }],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    const diagnosis = await primitives.diagnoseChanges({ currentFilePath: 'src/a.ts' })

    expect(diagnosis.rootCauseType).toBe('wrong_target')
    expect(['amend', 'continue']).toContain(diagnosis.nextAction)

    const plannerDecision = runtime.stateManager.getState().coding?.lastPlannerDecision
    expect(['src/a.ts', 'src/b.ts']).toContain(plannerDecision?.selectedFile)
    expect((plannerDecision?.decisionReason || '').length).toBeGreaterThan(0)
  })

  it('diagnoseChanges can override nextAction via counterfactual disagreement on close-margin hypotheses', async () => {
    const { runtime } = createRuntime({
      lastChangeReview: {
        status: 'failed',
        filesReviewed: ['src/changed.ts'],
        diffSummary: '1 file changed',
        diffPatchExcerpt: 'diff --git a/src/changed.ts b/src/changed.ts',
        validationSummary: 'Validation failed with exit 1: echo done',
        validationCommand: 'echo done',
        baselineComparison: 'new_red',
        detectedRisks: ['validation_failed'],
        unresolvedIssues: [],
        recommendedNextAction: 'investigate',
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    const diagnosis = await primitives.diagnoseChanges({
      validationOutput: 'Error: check failed',
    })

    expect(diagnosis.rootCauseType).toBe('incomplete_change')
    expect(diagnosis.nextAction).toBe('continue')
    expect(diagnosis.shouldAmendPlan).toBe(false)
    expect(diagnosis.evidence.some(item => item.includes('counterfactual_override:next_action'))).toBe(true)
    expect(diagnosis.evidence.some(item => item.includes('counterfactual_override:runner_up_tie_break'))).toBe(false)
  })

  it('diagnoseChanges prioritizes counterfactual nextAction over root-cause amend branch in active session', async () => {
    const { runtime } = createRuntime({
      lastChangeReview: {
        status: 'blocked',
        filesReviewed: ['src/a.ts'],
        diffSummary: '1 file changed',
        validationSummary: 'Validation passed',
        detectedRisks: ['patch_verification_mismatch'],
        unresolvedIssues: [],
        recommendedNextAction: 'Fix target',
      },
      currentPlanSession: {
        id: 'plan_counterfactual_priority',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'investigating',
        amendCount: 0,
        backtrackCount: 0,
        maxAmendCount: 2,
        maxBacktrackCount: 1,
        maxFiles: 2,
        changeIntent: 'behavior_fix',
        steps: [{ filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'needs_replan' }],
        reason: 'counterfactual priority test',
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    vi.spyOn(primitives as any, 'applyCounterfactualActionOverride').mockReturnValue({
      rootCauseType: 'wrong_target',
      nextAction: 'continue',
      notes: ['counterfactual_override:test_force_continue'],
    })

    const diagnosis = await primitives.diagnoseChanges({ currentFilePath: 'src/a.ts' })

    expect(diagnosis.rootCauseType).toBe('wrong_target')
    expect(diagnosis.nextAction).toBe('continue')
    expect(diagnosis.shouldAmendPlan).toBe(false)
    expect(diagnosis.shouldAbortPlan).toBe(false)
    expect(diagnosis.evidence.some(item => item.includes('counterfactual_priority_action'))).toBe(true)

    const updated = runtime.stateManager.getState().coding?.currentPlanSession
    expect(updated?.status).toBe('active')
    expect(updated?.backtrackCount).toBe(0)
  })

  it('diagnoseChanges aligns post-diagnosis planner decision with target judgement artifacts', async () => {
    const { runtime } = createRuntime({
      lastChangeReview: {
        status: 'failed',
        filesReviewed: ['src/a.ts'],
        diffSummary: '1 file changed',
        diffPatchExcerpt: 'diff --git a/src/a.ts b/src/a.ts',
        validationSummary: 'Validation failed with exit 1: pnpm test',
        validationCommand: 'pnpm test',
        baselineComparison: 'new_red',
        detectedRisks: ['validation_failed'],
        unresolvedIssues: [],
        recommendedNextAction: 'amend',
      },
      currentPlanSession: {
        id: 'plan_target_judge_alignment',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'investigating',
        amendCount: 0,
        backtrackCount: 0,
        maxAmendCount: 2,
        maxBacktrackCount: 1,
        maxFiles: 2,
        changeIntent: 'behavior_fix',
        steps: [
          { filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'needs_replan', dependsOn: [], checkpoint: 'none' },
          { filePath: 'src/b.ts', intent: 'behavior_fix', source: 'search', status: 'ready', dependsOn: [], checkpoint: 'none' },
        ],
        reason: 'target judge alignment',
      },
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/a.ts',
        candidates: [{ filePath: 'src/a.ts' }, { filePath: 'src/b.ts' }],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    vi.spyOn(primitives as any, 'buildTargetCaseAndJudgement').mockReturnValue({
      targetCase: {
        preparedAt: new Date().toISOString(),
        changeIntent: 'behavior_fix',
        candidates: [],
        currentPlannerFrontier: [],
        missingInformationHints: [],
      },
      targetJudgement: {
        winner: 'src/b.ts',
        runnerUp: 'src/a.ts',
        candidateScores: [
          { filePath: 'src/b.ts', score: 80, reason: 'judge winner' },
          { filePath: 'src/a.ts', score: 80, reason: 'judge runner up' },
        ],
        winnerReason: 'winner=src/b.ts',
        runnerUpReason: 'runner_up=src/a.ts',
        whyNotRunnerUp: 'winner=src/b.ts outranks runner_up=src/a.ts by tie-break.',
        missingInformation: [],
        targetKind: 'definition',
        architectureLayer: 'unknown',
        intentDecomposition: 'bugfix',
        mode: 'judge',
      },
    })

    const diagnosis = await primitives.diagnoseChanges({ currentFilePath: 'src/a.ts' })

    expect(diagnosis.nextAction).toBe('amend')

    const codingState = runtime.stateManager.getState().coding
    expect(codingState?.lastTargetDecisionCase).toBeDefined()
    expect(codingState?.lastTargetJudgement?.winner).toBe('src/b.ts')
    expect(codingState?.lastPlannerDecision?.selectedFile).toBe('src/b.ts')
    expect(codingState?.lastTargetSelection?.selectedFile).toBe('src/b.ts')
  })

  it('applyCounterfactualActionOverride promotes runner-up rootCause when winner check fails but runner-up passes', () => {
    const { runtime } = createRuntime()
    const primitives = new CodingPrimitives(runtime as any)

    const override = (primitives as any).applyCounterfactualActionOverride({
      rootCauseType: 'incomplete_change',
      nextAction: 'amend',
      competition: {
        winner: { rootCauseType: 'incomplete_change', score: 0.61, signals: ['validation_failed'] },
        runnerUp: { rootCauseType: 'missed_dependency', score: 0.45, signals: ['impact_companion_or_reference_hit'] },
        winnerReason: 'winner=incomplete_change',
        runnerUpReason: 'runner_up=missed_dependency',
        whyNotRunnerUpReason: 'margin=0.16',
        disambiguationSignals: ['validation_failed'],
        contestedSignals: [],
        conflicts: [],
      },
      diagnosisJudgement: {
        winner: 'incomplete_change',
        runnerUp: 'missed_dependency',
        candidateScores: [],
        winnerReason: 'winner=incomplete_change',
        runnerUpReason: 'runner_up=missed_dependency',
        conflictingEvidence: [],
        recommendedNextAction: 'amend',
        counterfactualChecks: [
          { hypothesis: 'incomplete_change', passed: false, reason: 'winner failed' },
          { hypothesis: 'missed_dependency', passed: true, reason: 'runner up passed' },
        ],
      },
      allowRootCauseOverride: true,
    })

    expect(override.rootCauseType).toBe('missed_dependency')
    expect(override.nextAction).toBe('amend')
    expect(override.notes.some((note: string) => note.includes('runner_up_promoted'))).toBe(true)
    expect(override.notes.some((note: string) => note.includes('counterfactual_arbitration:margin='))).toBe(true)
  })

  it('applyCounterfactualActionOverride keeps winner action when runner-up support is weaker', () => {
    const { runtime } = createRuntime()
    const primitives = new CodingPrimitives(runtime as any)

    const override = (primitives as any).applyCounterfactualActionOverride({
      rootCauseType: 'incomplete_change',
      nextAction: 'amend',
      competition: {
        winner: { rootCauseType: 'incomplete_change', score: 0.63, signals: ['validation_failed', 'unresolved_issues_remain'] },
        runnerUp: { rootCauseType: 'validation_command_mismatch', score: 0.56, signals: ['command_not_validation_like'] },
        winnerReason: 'winner=incomplete_change',
        runnerUpReason: 'runner_up=validation_command_mismatch',
        whyNotRunnerUpReason: 'margin=0.07',
        disambiguationSignals: ['validation_failed'],
        contestedSignals: [],
        conflicts: [],
      },
      diagnosisJudgement: {
        winner: 'incomplete_change',
        runnerUp: 'validation_command_mismatch',
        candidateScores: [],
        winnerReason: 'winner=incomplete_change',
        runnerUpReason: 'runner_up=validation_command_mismatch',
        conflictingEvidence: [],
        recommendedNextAction: 'amend',
        counterfactualChecks: [
          {
            id: 'cf_1_incomplete_change',
            hypothesis: 'incomplete_change',
            expectedObservation: 'expect validation_failed',
            observedEvidence: ['validation_failed', 'unresolved_issues_remain'],
            passed: true,
            rationale: 'winner has stronger support',
          },
          {
            id: 'cf_2_validation_command_mismatch',
            hypothesis: 'validation_command_mismatch',
            expectedObservation: 'expect no_validation_run',
            observedEvidence: ['command_not_validation_like'],
            passed: true,
            rationale: 'runner-up has weaker support',
          },
        ],
      },
      allowRootCauseOverride: true,
    })

    expect(override.rootCauseType).toBe('incomplete_change')
    expect(override.nextAction).toBe('amend')
    expect(override.notes.some((note: string) => note.includes('counterfactual_arbitration:keep_winner_action_due_to_support_gap'))).toBe(true)
    expect(override.notes.some((note: string) => note.includes('counterfactual_arbitration:margin='))).toBe(true)
  })

  it('applyCounterfactualActionOverride preserves amend when missed_dependency has strong companion/dependency evidence', () => {
    const { runtime } = createRuntime()
    const primitives = new CodingPrimitives(runtime as any)

    const override = (primitives as any).applyCounterfactualActionOverride({
      rootCauseType: 'missed_dependency',
      nextAction: 'amend',
      competition: {
        winner: { rootCauseType: 'missed_dependency', score: 0.66, signals: ['impact_companion_or_reference_hit'] },
        runnerUp: { rootCauseType: 'validation_command_mismatch', score: 0.57, signals: ['command_not_validation_like'] },
        winnerReason: 'winner=missed_dependency',
        runnerUpReason: 'runner_up=validation_command_mismatch',
        whyNotRunnerUpReason: 'margin=0.09',
        disambiguationSignals: ['impact_companion_or_reference_hit'],
        contestedSignals: [],
        conflicts: [],
      },
      diagnosisJudgement: {
        winner: 'missed_dependency',
        runnerUp: 'validation_command_mismatch',
        candidateScores: [],
        winnerReason: 'winner=missed_dependency',
        runnerUpReason: 'runner_up=validation_command_mismatch',
        conflictingEvidence: [],
        recommendedNextAction: 'amend',
        counterfactualChecks: [
          { hypothesis: 'missed_dependency', passed: false, reason: 'winner weak under cf' },
          { hypothesis: 'validation_command_mismatch', passed: true, reason: 'runner up passed' },
        ],
      },
      allowRootCauseOverride: true,
    })

    expect(override.rootCauseType).toBe('missed_dependency')
    expect(override.nextAction).toBe('amend')
    expect(override.notes.some((note: string) => note.includes('counterfactual_guard:missed_dependency_strong_evidence_preserve_amend'))).toBe(true)
  })

  it('diagnoseChanges keeps amend for missed_dependency when strong companion evidence exists', async () => {
    const { runtime } = createRuntime({
      lastImpactAnalysis: {
        status: 'ok',
        languageSupport: 'js_ts',
        explanation: 'ok',
        targetCandidates: [],
        importExportNeighbors: [],
        directReferences: [],
        likelyImpactedTests: [],
        likelyCompanionFiles: ['src/b.ts'],
        graphSnapshot: { maxDepth: 1, truncated: false, nodes: [], edges: [] },
      },
      lastChangeReview: {
        status: 'blocked',
        filesReviewed: ['src/a.ts'],
        diffSummary: '2 files changed',
        diffPatchExcerpt: 'diff --git a/src/a.ts b/src/a.ts',
        validationSummary: 'Validation failed with exit 1: pnpm test',
        validationCommand: 'pnpm test',
        baselineComparison: 'new_red',
        detectedRisks: ['unexpected_files_touched'],
        unresolvedIssues: [],
        recommendedNextAction: 'amend',
      },
      currentPlanSession: {
        id: 'plan_missed_dependency_guard',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'investigating',
        amendCount: 0,
        backtrackCount: 0,
        maxAmendCount: 2,
        maxBacktrackCount: 1,
        maxFiles: 2,
        changeIntent: 'behavior_fix',
        steps: [{ filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'needs_replan' }],
        reason: 'missed dependency guard',
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    const diagnosis = await primitives.diagnoseChanges({ currentFilePath: 'src/a.ts' })

    expect(diagnosis.rootCauseType).toBe('missed_dependency')
    expect(diagnosis.nextAction).toBe('amend')
    expect(diagnosis.shouldAmendPlan).toBe(true)
    expect(diagnosis.recommendedRepairWindow?.scope).toBe('dependency_slice')
    expect((diagnosis.recommendedRepairWindow?.files || []).length).toBeGreaterThan(0)
  })

  it('applyTargetJudgementToPlannerDecision can promote diagnosis repair-window winner on score tie', () => {
    const { runtime } = createRuntime()
    const primitives = new CodingPrimitives(runtime as any)

    const plannerDecision = {
      selectedFile: 'src/a.ts',
      selectionMode: 'dependency_ready',
      decisionReason: 'Planner selected src/a.ts.',
      candidateScores: [
        { filePath: 'src/a.ts', status: 'ready', score: 72, reasons: ['dependencies_satisfied(+40)'] },
        { filePath: 'src/b.ts', status: 'ready', score: 72, reasons: ['dependencies_satisfied(+40)'] },
      ],
    }

    const targetJudgement = {
      winner: 'src/b.ts',
      runnerUp: 'src/a.ts',
      candidateScores: [
        { filePath: 'src/b.ts', score: 72, reason: 'judge tie winner' },
        { filePath: 'src/a.ts', score: 72, reason: 'judge runner up' },
      ],
      winnerReason: 'winner=src/b.ts on repair window',
      runnerUpReason: 'runner_up=src/a.ts',
      whyNotRunnerUp: 'winner=src/b.ts selected by dependency repair window.',
      missingInformation: [],
      targetKind: 'definition',
      architectureLayer: 'unknown',
      intentDecomposition: 'bugfix',
      mode: 'judge',
    }

    const promoted = (primitives as any).applyTargetJudgementToPlannerDecision(
      plannerDecision,
      targetJudgement,
      {
        diagnosis: {
          nextAction: 'amend',
          recommendedRepairWindow: {
            scope: 'dependency_slice',
            files: ['src/b.ts'],
            reason: 'repair window prefers b',
          },
        },
      },
    )

    expect(promoted.selectedFile).toBe('src/b.ts')
    expect(promoted.decisionReason).toContain('Planner constraint(target_judgement)')
  })

  it('diagnoseChanges lets counterfactual trace reprioritize planner target file for replanning', async () => {
    const { runtime } = createRuntime({
      lastImpactAnalysis: {
        status: 'ok',
        languageSupport: 'js_ts',
        explanation: 'ok',
        targetCandidates: [],
        importExportNeighbors: [],
        directReferences: [],
        likelyImpactedTests: [],
        likelyCompanionFiles: ['src/b.ts'],
        graphSnapshot: { maxDepth: 1, truncated: false, nodes: [], edges: [] },
      },
      lastChangeReview: {
        status: 'blocked',
        filesReviewed: ['src/a.ts'],
        diffSummary: '2 files changed',
        diffPatchExcerpt: 'diff --git a/src/a.ts b/src/a.ts',
        validationSummary: 'Validation failed with exit 1: pnpm test',
        validationCommand: 'pnpm test',
        baselineComparison: 'new_red',
        detectedRisks: ['patch_verification_mismatch', 'unexpected_files_touched'],
        unresolvedIssues: [],
        recommendedNextAction: 'amend',
      },
      currentPlanSession: {
        id: 'plan_counterfactual_replan',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'investigating',
        amendCount: 0,
        backtrackCount: 0,
        maxAmendCount: 2,
        maxBacktrackCount: 1,
        maxFiles: 2,
        changeIntent: 'behavior_fix',
        steps: [
          { filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'needs_replan', dependsOn: [], checkpoint: 'none' },
          { filePath: 'src/b.ts', intent: 'behavior_fix', source: 'search', status: 'ready', dependsOn: [], checkpoint: 'validation_required_before_next' },
        ],
        reason: 'counterfactual replan preference',
      },
      lastTargetSelection: {
        status: 'selected',
        selectedFile: 'src/a.ts',
        candidates: [{ filePath: 'src/a.ts' }, { filePath: 'src/b.ts' }],
        reason: 'selected',
        recommendedNextAction: 'continue',
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    const diagnosis = await primitives.diagnoseChanges({ currentFilePath: 'src/a.ts' })

    expect(diagnosis.rootCauseType).toBe('wrong_target')
    expect(diagnosis.nextAction).toBe('amend')

    const plannerDecision = runtime.stateManager.getState().coding?.lastPlannerDecision
    expect(plannerDecision?.selectedFile).toBe('src/b.ts')
    expect((plannerDecision?.decisionReason || '').length).toBeGreaterThan(0)
  })

  it('diagnoseChanges classifies baseline_noise and continues without amend', async () => {
    const { runtime } = createRuntime({
      lastChangeReview: {
        status: 'failed',
        filesReviewed: ['src/a.ts'],
        diffSummary: '1 file changed',
        diffPatchExcerpt: 'diff --git a/src/a.ts b/src/a.ts',
        validationSummary: 'Validation failed with exit 1: pnpm test',
        validationCommand: 'pnpm test',
        baselineComparison: 'baseline_noise',
        detectedRisks: ['validation_failed'],
        unresolvedIssues: [],
        recommendedNextAction: 'continue',
      },
      currentPlanSession: {
        id: 'plan_2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'investigating',
        amendCount: 0,
        backtrackCount: 0,
        maxAmendCount: 2,
        maxBacktrackCount: 1,
        maxFiles: 2,
        changeIntent: 'behavior_fix',
        steps: [{ filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'in_progress' }],
        reason: 'test',
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    const diagnosis = await primitives.diagnoseChanges({})

    expect(diagnosis.rootCauseType).toBe('baseline_noise')
    expect(diagnosis.nextAction).toBe('continue')
    expect(diagnosis.shouldAmendPlan).toBe(false)
    expect(diagnosis.shouldAbortPlan).toBe(false)
    expect(['validation_command_mismatch', 'incomplete_change']).toContain(
      diagnosis.confidenceBreakdown?.competition?.runnerUp?.rootCauseType,
    )
    expect((diagnosis.confidenceBreakdown?.competition?.winnerReason || '').length).toBeGreaterThan(0)
    expect((diagnosis.confidenceBreakdown?.competition?.runnerUpReason || '').length).toBeGreaterThan(0)
    expect((diagnosis.confidenceBreakdown?.competition?.whyNotRunnerUpReason || '').length).toBeGreaterThan(0)
    expect((diagnosis.confidenceBreakdown?.competition?.conflicts || []).length).toBeGreaterThan(0)
  })

  it('diagnoseChanges classifies validation_command_mismatch when command is non-validation', async () => {
    const { runtime } = createRuntime({
      lastChangeReview: {
        status: 'needs_follow_up',
        filesReviewed: ['src/a.ts'],
        diffSummary: '1 file changed',
        diffPatchExcerpt: 'diff --git a/src/a.ts b/src/a.ts',
        validationSummary: 'No validation command detected',
        validationCommand: 'echo done',
        baselineComparison: 'unknown',
        detectedRisks: ['no_validation_run'],
        unresolvedIssues: [],
        recommendedNextAction: 'run tests',
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    const diagnosis = await primitives.diagnoseChanges({})

    expect(diagnosis.rootCauseType).toBe('validation_command_mismatch')
    expect(diagnosis.nextAction).toBe('continue')
    expect(diagnosis.shouldAmendPlan).toBe(false)
    expect(diagnosis.shouldAbortPlan).toBe(false)
  })

  it('diagnoseChanges classifies test_only_breakage for assertion failures', async () => {
    const { runtime } = createRuntime({
      lastChangeReview: {
        status: 'failed',
        filesReviewed: ['src/a.test.ts'],
        diffSummary: '1 file changed',
        diffPatchExcerpt: 'diff --git a/src/a.test.ts b/src/a.test.ts',
        validationSummary: 'Validation failed with exit 1: pnpm test',
        validationCommand: 'pnpm test',
        baselineComparison: 'new_red',
        detectedRisks: ['validation_failed'],
        unresolvedIssues: [],
        recommendedNextAction: 'fix assertions',
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    const diagnosis = await primitives.diagnoseChanges({
      validationOutput: 'expect(received).toEqual(expected)',
    })

    expect(diagnosis.rootCauseType).toBe('test_only_breakage')
    expect(diagnosis.nextAction).toBe('amend')
    expect(diagnosis.shouldAmendPlan).toBe(true)
  })

  it('diagnoseChanges emits JS/TS causal hints from touched symbols and validation output', async () => {
    const { runtime } = createRuntime({
      lastImpactAnalysis: {
        status: 'ok',
        languageSupport: 'js_ts',
        explanation: 'ok',
        targetCandidates: [],
        importExportNeighbors: [],
        directReferences: [],
        likelyImpactedTests: ['src/a.test.ts'],
        likelyCompanionFiles: ['src/a.ts'],
        graphSnapshot: { maxDepth: 1, truncated: false, nodes: [], edges: [] },
      },
      lastChangeReview: {
        status: 'failed',
        filesReviewed: ['src/a.ts'],
        diffSummary: '1 file changed',
        diffPatchExcerpt: 'diff --git a/src/a.ts b/src/a.ts\n+const fooValue = 1',
        validationSummary: 'Validation failed with exit 1: pnpm test',
        validationCommand: 'pnpm test',
        baselineComparison: 'new_red',
        detectedRisks: ['validation_failed'],
        unresolvedIssues: [],
        recommendedNextAction: 'investigate',
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    const diagnosis = await primitives.diagnoseChanges({
      validationOutput: 'Error: fooValue is not defined in src/a.ts',
    })

    expect(Array.isArray(diagnosis.causalHints)).toBe(true)
    expect((diagnosis.causalHints || []).some(hint => hint.includes('validation_mentions_symbol:fooValue'))).toBe(true)
    expect((diagnosis.causalHints || []).some(hint => hint.includes('validation_mentions_file:src/a.ts'))).toBe(true)
  })

  it('diagnoseChanges amends plan by adding missed dependency file when capacity allows', async () => {
    const { runtime } = createRuntime({
      lastImpactAnalysis: {
        status: 'ok',
        languageSupport: 'js_ts',
        explanation: 'ok',
        targetCandidates: [],
        importExportNeighbors: [],
        directReferences: [],
        likelyImpactedTests: [],
        likelyCompanionFiles: ['src/b.ts'],
        graphSnapshot: { maxDepth: 1, truncated: false, nodes: [], edges: [] },
      },
      lastChangeReview: {
        status: 'blocked',
        filesReviewed: ['src/a.ts'],
        diffSummary: '2 files changed',
        diffPatchExcerpt: 'diff --git a/src/a.ts b/src/a.ts',
        validationSummary: 'Validation failed with exit 1: pnpm test',
        validationCommand: 'pnpm test',
        baselineComparison: 'new_red',
        detectedRisks: ['unexpected_files_touched'],
        unresolvedIssues: [],
        recommendedNextAction: 'amend',
      },
      currentPlanSession: {
        id: 'plan_3',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'investigating',
        amendCount: 0,
        backtrackCount: 0,
        maxAmendCount: 2,
        maxBacktrackCount: 1,
        maxFiles: 2,
        changeIntent: 'behavior_fix',
        steps: [{ filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'needs_replan' }],
        reason: 'test',
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    const diagnosis = await primitives.diagnoseChanges({ currentFilePath: 'src/a.ts' })

    expect(diagnosis.rootCauseType).toBe('missed_dependency')
    expect(diagnosis.nextAction).toBe('amend')
    expect(diagnosis.confidenceBreakdown?.competition?.winner?.rootCauseType).toBe('missed_dependency')
    expect(diagnosis.confidenceBreakdown?.competition?.runnerUp?.rootCauseType).toBe('incomplete_change')
    expect((diagnosis.confidenceBreakdown?.candidateScores || []).length).toBeGreaterThan(1)
    expect((diagnosis.confidenceBreakdown?.competition?.disambiguationSignals || []).length).toBeGreaterThan(0)
    expect(diagnosis.recommendedRepairWindow?.scope).toBe('dependency_slice')
    expect((diagnosis.recommendedRepairWindow?.files || []).length).toBeGreaterThan(0)
    const updated = runtime.stateManager.getState().coding?.currentPlanSession
    expect(updated?.status).toBe('amended')
    expect(updated?.steps.some(step => step.filePath === 'src/b.ts')).toBe(true)
  })

  it('diagnoseChanges rewires downstream dependsOn to inserted missed dependency step', async () => {
    const { runtime } = createRuntime({
      lastImpactAnalysis: {
        status: 'ok',
        languageSupport: 'js_ts',
        explanation: 'ok',
        targetCandidates: [],
        importExportNeighbors: [],
        directReferences: [],
        likelyImpactedTests: [],
        likelyCompanionFiles: ['src/b.ts'],
        graphSnapshot: { maxDepth: 1, truncated: false, nodes: [], edges: [] },
      },
      lastChangeReview: {
        status: 'blocked',
        filesReviewed: ['src/a.ts'],
        diffSummary: '2 files changed',
        diffPatchExcerpt: 'diff --git a/src/a.ts b/src/a.ts',
        validationSummary: 'Validation failed with exit 1: pnpm test',
        validationCommand: 'pnpm test',
        baselineComparison: 'new_red',
        detectedRisks: ['unexpected_files_touched'],
        unresolvedIssues: [],
        recommendedNextAction: 'amend',
      },
      currentPlanSession: {
        id: 'plan_4',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'investigating',
        amendCount: 0,
        backtrackCount: 0,
        maxAmendCount: 2,
        maxBacktrackCount: 1,
        maxFiles: 3,
        changeIntent: 'behavior_fix',
        steps: [
          { filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'in_progress' },
          { filePath: 'src/c.ts', intent: 'behavior_fix', source: 'search', status: 'blocked_by_dependency', dependsOn: ['src/a.ts'], checkpoint: 'validation_required_before_next' },
        ],
        reason: 'test',
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    const diagnosis = await primitives.diagnoseChanges({ currentFilePath: 'src/a.ts' })

    expect(diagnosis.rootCauseType).toBe('missed_dependency')
    expect(diagnosis.nextAction).toBe('amend')

    const updated = runtime.stateManager.getState().coding?.currentPlanSession
    expect(updated?.steps.map(step => step.filePath)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts'])
    expect(updated?.steps.find(step => step.filePath === 'src/c.ts')?.dependsOn).toEqual(['src/b.ts'])
  })

  it('diagnoseChanges aborts (not amend) when missed dependency exists but plan session is at max file capacity', async () => {
    const { runtime } = createRuntime({
      lastImpactAnalysis: {
        status: 'ok',
        languageSupport: 'js_ts',
        explanation: 'ok',
        targetCandidates: [],
        importExportNeighbors: [],
        directReferences: [],
        likelyImpactedTests: [],
        likelyCompanionFiles: ['src/b.ts'],
        graphSnapshot: { maxDepth: 1, truncated: false, nodes: [], edges: [] },
      },
      lastChangeReview: {
        status: 'blocked',
        filesReviewed: ['src/a.ts'],
        diffSummary: '2 files changed',
        diffPatchExcerpt: 'diff --git a/src/a.ts b/src/a.ts',
        validationSummary: 'Validation failed with exit 1: pnpm test',
        validationCommand: 'pnpm test',
        baselineComparison: 'new_red',
        detectedRisks: ['unexpected_files_touched'],
        unresolvedIssues: [],
        recommendedNextAction: 'amend',
      },
      currentPlanSession: {
        id: 'plan_5',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'investigating',
        amendCount: 0,
        backtrackCount: 0,
        maxAmendCount: 2,
        maxBacktrackCount: 1,
        maxFiles: 1,
        changeIntent: 'behavior_fix',
        steps: [{ filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'needs_replan' }],
        reason: 'test',
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    const diagnosis = await primitives.diagnoseChanges({ currentFilePath: 'src/a.ts' })

    expect(diagnosis.rootCauseType).toBe('missed_dependency')
    expect(diagnosis.nextAction).toBe('abort')
    expect(diagnosis.shouldAbortPlan).toBe(true)
    expect(diagnosis.shouldAmendPlan).toBe(false)
    expect(diagnosis.evidence.some(item => item.includes('missed_dependency_capacity_exhausted'))).toBe(true)

    const updated = runtime.stateManager.getState().coding?.currentPlanSession
    expect(updated?.status).toBe('aborted')
  })

  it('diagnoseChanges aborts (not amend) when amend budget is exhausted', async () => {
    const { runtime } = createRuntime({
      lastChangeReview: {
        status: 'failed',
        filesReviewed: ['src/a.ts'],
        diffSummary: '1 file changed',
        diffPatchExcerpt: 'diff --git a/src/a.ts b/src/a.ts',
        validationSummary: 'Validation failed with exit 1: pnpm test',
        validationCommand: 'pnpm test',
        baselineComparison: 'new_red',
        detectedRisks: ['validation_failed'],
        unresolvedIssues: [],
        recommendedNextAction: 'amend',
      },
      currentPlanSession: {
        id: 'plan_6',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'investigating',
        amendCount: 2,
        backtrackCount: 0,
        maxAmendCount: 2,
        maxBacktrackCount: 1,
        maxFiles: 2,
        changeIntent: 'behavior_fix',
        steps: [{ filePath: 'src/a.ts', intent: 'behavior_fix', source: 'target_selection', status: 'needs_replan' }],
        reason: 'test',
      },
    })

    const primitives = new CodingPrimitives(runtime as any)
    const diagnosis = await primitives.diagnoseChanges({ currentFilePath: 'src/a.ts' })

    expect(diagnosis.rootCauseType).toBe('incomplete_change')
    expect(diagnosis.nextAction).toBe('abort')
    expect(diagnosis.shouldAbortPlan).toBe(true)
    expect(diagnosis.shouldAmendPlan).toBe(false)

    const updated = runtime.stateManager.getState().coding?.currentPlanSession
    expect(updated?.status).toBe('aborted')
  })

  it('captureValidationBaseline stores baseline and switches workspace to deterministic worktree path when git is available', async () => {
    const { runtime } = createRuntime({
      workspacePath: '/mock/workspace/root',
    })
    const primitives = new CodingPrimitives(runtime as any)

    vi.mocked(fs.rm).mockResolvedValue(undefined as any)

    const baseline = await primitives.captureValidationBaseline({
      workspacePath: '/mock/workspace/root',
      createTemporaryWorktree: true,
    })

    expect(baseline.workspaceMetadata.gitAvailable).toBe(true)
    expect(baseline.workspacePath).toContain('/mock/workspace/root/.airi-agentic-worktree')
    expect(runtime.stateManager.getState().coding?.workspacePath).toContain('/mock/workspace/root/.airi-agentic-worktree')
  })
})
