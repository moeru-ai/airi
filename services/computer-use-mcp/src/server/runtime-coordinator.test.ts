import type { RuntimeCoordinatorHost } from './runtime-coordinator'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { RunStateManager } from '../state'
import { createDisplayInfo, createLocalExecutionTarget, createTerminalState } from '../test-fixtures'
import { createRuntimeCoordinator } from './runtime-coordinator'

describe('createRuntimeCoordinator', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function createMockRuntime(): RuntimeCoordinatorHost {
    const stateManager = new RunStateManager()
    const session = {
      listPendingActions: vi.fn().mockReturnValue([]),
      getBudgetState: vi.fn().mockReturnValue({
        operationsExecuted: 5,
        operationUnitsConsumed: 10,
      }),
      record: vi.fn().mockResolvedValue(undefined),
      getLastScreenshot: vi.fn().mockReturnValue(undefined),
    }
    const executor = {
      kind: 'dry-run' as const,
      describe: () => ({ kind: 'dry-run' as const, notes: [] }),
      getExecutionTarget: vi.fn().mockResolvedValue(createLocalExecutionTarget()),
      getForegroundContext: vi.fn().mockResolvedValue({
        available: true,
        appName: 'Google Chrome',
        platform: 'darwin' as const,
      }),
      getDisplayInfo: vi.fn().mockResolvedValue(createDisplayInfo({
        platform: 'darwin',
      })),
    }
    const terminalRunner = {
      describe: () => ({ kind: 'local-shell-runner' as const, notes: [] }),
      getState: vi.fn().mockReturnValue(createTerminalState()),
    }
    const browserDomBridge = {
      getStatus: vi.fn().mockReturnValue({
        enabled: true,
        host: '127.0.0.1',
        port: 8765,
        connected: true,
        pendingRequests: 0,
      }),
    }
    const cdpBridgeManager = {
      probeAvailability: vi.fn().mockResolvedValue({
        endpoint: 'http://localhost:9222',
        connected: false,
        connectable: true,
        lastError: undefined,
      }),
    }

    return {
      session: session as any,
      executor: executor as any,
      terminalRunner: terminalRunner as any,
      browserDomBridge: browserDomBridge as any,
      cdpBridgeManager: cdpBridgeManager as any,
      stateManager,
    }
  }

  it('refreshSnapshot returns complete RuntimeSnapshot', async () => {
    const runtime = createMockRuntime()
    const coordinator = createRuntimeCoordinator(runtime)

    const snapshot = await coordinator.refreshSnapshot('tool_entry')

    expect(snapshot).toMatchObject({
      capturedAt: expect.any(String),
      reason: 'tool_entry',
      executionTarget: expect.objectContaining({
        mode: 'local-windowed',
      }),
      foregroundContext: expect.objectContaining({
        available: true,
        appName: 'Google Chrome',
      }),
      displayInfo: expect.objectContaining({
        platform: 'darwin',
      }),
      terminalState: expect.objectContaining({
        effectiveCwd: expect.any(String),
      }),
      browserSurfaceAvailability: expect.objectContaining({
        executionMode: 'local-windowed',
      }),
      cdpAvailability: expect.objectContaining({
        endpoint: 'http://localhost:9222',
      }),
      sessionBudget: {
        operationsExecuted: 5,
        operationUnitsConsumed: 10,
      },
      pendingApprovalCount: 0,
    })
  })

  it('snapshot includes session/state/browser/CDP/terminal aggregated', async () => {
    const runtime = createMockRuntime()
    const coordinator = createRuntimeCoordinator(runtime)

    const snapshot = await coordinator.refreshSnapshot('workflow_start')

    // All subsystems probed
    expect(runtime.executor.getExecutionTarget).toHaveBeenCalled()
    expect(runtime.executor.getForegroundContext).toHaveBeenCalled()
    expect(runtime.executor.getDisplayInfo).toHaveBeenCalled()
    expect(runtime.cdpBridgeManager.probeAvailability).toHaveBeenCalled()

    // Snapshot contains all aggregated fields
    expect(snapshot.executionTarget).toBeDefined()
    expect(snapshot.foregroundContext).toBeDefined()
    expect(snapshot.displayInfo).toBeDefined()
    expect(snapshot.terminalState).toBeDefined()
    expect(snapshot.browserSurfaceAvailability).toBeDefined()
    expect(snapshot.cdpAvailability).toBeDefined()
    expect(snapshot.sessionBudget).toBeDefined()
    expect(snapshot.pendingApprovalCount).toBeDefined()
  })

  it('attaches runtime facts and keeps top-level fields mirrored', async () => {
    const runtime = createMockRuntime()
    const coordinator = createRuntimeCoordinator(runtime)

    const snapshot = await coordinator.refreshSnapshot('verification_check')

    expect(snapshot.facts.executionTarget).toMatchObject({
      source: 'executor_probe',
      confidence: 'high',
      ttlMs: 5000,
      probedAt: expect.any(Number),
    })
    expect(snapshot.facts.foregroundContext).toMatchObject({
      source: 'executor_probe',
      confidence: 'medium',
      ttlMs: 3000,
      probedAt: expect.any(Number),
    })
    expect(snapshot.facts.displayInfo).toMatchObject({
      source: 'executor_probe',
      confidence: 'high',
      ttlMs: 60000,
      probedAt: expect.any(Number),
    })
    expect(snapshot.facts.terminalState).toMatchObject({
      source: 'terminal_runner',
      confidence: 'high',
      ttlMs: 3000,
      probedAt: expect.any(Number),
    })
    expect(snapshot.facts.browserSurfaceAvailability).toMatchObject({
      source: 'derived',
      confidence: 'medium',
      ttlMs: 5000,
      probedAt: expect.any(Number),
    })
    expect(snapshot.facts.cdpAvailability).toMatchObject({
      source: 'cdp_bridge_manager',
      confidence: 'high',
      ttlMs: 5000,
      probedAt: expect.any(Number),
    })

    expect(snapshot.facts.executionTarget.value).toBe(snapshot.executionTarget)
    expect(snapshot.facts.foregroundContext.value).toBe(snapshot.foregroundContext)
    expect(snapshot.facts.displayInfo.value).toBe(snapshot.displayInfo)
    expect(snapshot.facts.terminalState.value).toBe(snapshot.terminalState)
    expect(snapshot.facts.browserSurfaceAvailability.value).toBe(snapshot.browserSurfaceAvailability)
    expect(snapshot.facts.cdpAvailability.value).toBe(snapshot.cdpAvailability)
  })

  it('captures per-fact probe timing and derives browser fact timing from inputs', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-07T00:00:00.000Z'))

    const runtime = createMockRuntime()
    runtime.executor.getExecutionTarget = vi.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return createLocalExecutionTarget()
    })
    runtime.executor.getForegroundContext = vi.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
      return {
        available: true,
        appName: 'Google Chrome',
        platform: 'darwin' as const,
      }
    })
    runtime.executor.getDisplayInfo = vi.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 30))
      return createDisplayInfo({
        platform: 'darwin',
      })
    })
    runtime.cdpBridgeManager.probeAvailability = vi.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 40))
      return {
        endpoint: 'http://localhost:9222',
        connected: false,
        connectable: true,
        lastError: undefined,
      }
    })

    const coordinator = createRuntimeCoordinator(runtime)
    const snapshotPromise = coordinator.refreshSnapshot('verification_check')
    await vi.runAllTimersAsync()
    const snapshot = await snapshotPromise

    expect(snapshot.facts.executionTarget.probedAt).toBeLessThan(snapshot.facts.foregroundContext.probedAt)
    expect(snapshot.facts.foregroundContext.probedAt).toBeLessThan(snapshot.facts.displayInfo.probedAt)
    expect(snapshot.facts.displayInfo.probedAt).toBeLessThanOrEqual(snapshot.facts.cdpAvailability.probedAt)
    expect(snapshot.facts.browserSurfaceAvailability.probedAt).toBeGreaterThanOrEqual(snapshot.facts.cdpAvailability.probedAt)
    expect(Date.parse(snapshot.capturedAt)).toBeGreaterThanOrEqual(snapshot.facts.browserSurfaceAvailability.probedAt)
  })

  it('includes lastScreenshot when present', async () => {
    const runtime = createMockRuntime()
    runtime.session.getLastScreenshot = vi.fn().mockReturnValue({
      path: '/tmp/screenshot.png',
      width: 1920,
      height: 1080,
      capturedAt: '2024-01-01T00:00:00Z',
      placeholder: false,
    })
    const coordinator = createRuntimeCoordinator(runtime)

    const snapshot = await coordinator.refreshSnapshot('tool_entry')

    expect(snapshot.lastScreenshot).toEqual({
      path: '/tmp/screenshot.png',
      width: 1920,
      height: 1080,
      capturedAt: '2024-01-01T00:00:00Z',
      placeholder: false,
    })
    expect(snapshot.facts.lastScreenshot).toMatchObject({
      value: snapshot.lastScreenshot,
      source: 'session',
      confidence: 'high',
      ttlMs: 10000,
      probedAt: new Date('2024-01-01T00:00:00Z').valueOf(),
    })
  })

  it('lastScreenshot is undefined when not present', async () => {
    const runtime = createMockRuntime()
    const coordinator = createRuntimeCoordinator(runtime)

    const snapshot = await coordinator.refreshSnapshot('tool_entry')

    expect(snapshot.lastScreenshot).toBeUndefined()
  })

  it('records snapshot_refreshed trace event', async () => {
    const runtime = createMockRuntime()
    const coordinator = createRuntimeCoordinator(runtime)

    await coordinator.refreshSnapshot('policy_check')

    expect(runtime.session.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'runtime:snapshot_refreshed',
        metadata: expect.objectContaining({
          type: 'snapshot_refreshed',
          reason: 'policy_check',
        }),
      }),
    )
  })

  it('supports verification_check and repair_check refresh reasons', async () => {
    const runtime = createMockRuntime()
    const coordinator = createRuntimeCoordinator(runtime)

    await coordinator.refreshSnapshot('verification_check')
    await coordinator.refreshSnapshot('repair_check')

    const recordMock = runtime.session.record as unknown as ReturnType<typeof vi.fn>
    const events = recordMock.mock.calls
      .map(call => call[0])
      .filter(entry => entry.event === 'runtime:snapshot_refreshed')

    expect(events.some(entry => entry.metadata?.reason === 'verification_check')).toBe(true)
    expect(events.some(entry => entry.metadata?.reason === 'repair_check')).toBe(true)
  })

  it('records surface_summary_updated on first refresh', async () => {
    const runtime = createMockRuntime()
    const coordinator = createRuntimeCoordinator(runtime)

    await coordinator.refreshSnapshot('tool_entry')

    expect(runtime.session.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'runtime:surface_summary_updated',
        metadata: expect.objectContaining({
          type: 'surface_summary_updated',
          summary: expect.objectContaining({
            executionMode: 'local-windowed',
            browserAvailable: true,
          }),
        }),
      }),
    )
  })

  it('records cdp_probe_failed trace event when CDP fails', async () => {
    const runtime = createMockRuntime()
    runtime.cdpBridgeManager.probeAvailability = vi.fn().mockResolvedValue({
      endpoint: 'http://localhost:9222',
      connected: false,
      connectable: false,
      lastError: 'Connection refused',
    })
    const coordinator = createRuntimeCoordinator(runtime)

    await coordinator.refreshSnapshot('tool_entry')

    expect(runtime.session.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'runtime:cdp_probe_failed',
        metadata: expect.objectContaining({
          type: 'cdp_probe_failed',
          endpoint: 'http://localhost:9222',
          error: 'Connection refused',
        }),
      }),
    )
  })

  it('records browser_surface_unavailable trace event when browser unavailable', async () => {
    const runtime = createMockRuntime()
    runtime.browserDomBridge.getStatus = vi.fn().mockReturnValue({
      enabled: false,
      connected: false,
      lastError: 'Extension not installed',
    })
    runtime.cdpBridgeManager.probeAvailability = vi.fn().mockResolvedValue({
      endpoint: 'http://localhost:9222',
      connected: false,
      connectable: false,
      lastError: 'CDP unavailable',
    })
    const coordinator = createRuntimeCoordinator(runtime)

    await coordinator.refreshSnapshot('tool_entry')

    expect(runtime.session.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'runtime:browser_surface_unavailable',
        metadata: expect.objectContaining({
          type: 'browser_surface_unavailable',
          extensionError: 'Extension not installed',
          cdpError: 'CDP unavailable',
        }),
      }),
    )
  })

  it('getLastSnapshot returns undefined before first refresh', () => {
    const runtime = createMockRuntime()
    const coordinator = createRuntimeCoordinator(runtime)

    const snapshot = coordinator.getLastSnapshot()

    expect(snapshot).toBeUndefined()
  })

  it('getLastSnapshot returns cached snapshot after refresh', async () => {
    const runtime = createMockRuntime()
    const coordinator = createRuntimeCoordinator(runtime)

    const refreshed = await coordinator.refreshSnapshot('tool_entry')
    const cached = coordinator.getLastSnapshot()

    expect(cached).toBe(refreshed)
  })

  it('getSurfaceSummary returns pessimistic summary when no snapshot', () => {
    const runtime = createMockRuntime()
    const coordinator = createRuntimeCoordinator(runtime)

    const summary = coordinator.getSurfaceSummary()

    expect(summary).toEqual({
      executionMode: 'dry-run',
      browserAvailable: false,
      cdpConnected: false,
      cdpConnectable: false,
      terminalAvailable: false,
      foregroundContextAvailable: false,
    })
  })

  it('getSurfaceSummary returns accurate summary after refresh', async () => {
    const runtime = createMockRuntime()
    const coordinator = createRuntimeCoordinator(runtime)

    await coordinator.refreshSnapshot('tool_entry')
    const summary = coordinator.getSurfaceSummary()

    expect(summary).toMatchObject({
      executionMode: 'local-windowed',
      browserAvailable: true,
      browserPreferredSurface: 'browser_dom',
      cdpConnected: false,
      cdpConnectable: true,
      terminalAvailable: true,
      foregroundContextAvailable: true,
    })
  })

  it('recordTrace appends runtime trace event to session', async () => {
    const runtime = createMockRuntime()
    const coordinator = createRuntimeCoordinator(runtime)

    await coordinator.recordTrace({
      type: 'surface_summary_updated',
      summary: {
        executionMode: 'local-windowed',
        browserAvailable: true,
        cdpConnected: false,
        cdpConnectable: true,
        terminalAvailable: true,
        foregroundContextAvailable: true,
      },
    })

    expect(runtime.session.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'runtime:surface_summary_updated',
        metadata: expect.objectContaining({
          type: 'surface_summary_updated',
        }),
      }),
    )
  })

  describe('invalidation queue', () => {
    it('starts with empty pending tags', () => {
      const runtime = createMockRuntime()
      const coordinator = createRuntimeCoordinator(runtime)

      expect(coordinator.getPendingInvalidationTags().size).toBe(0)
    })

    it('enqueueInvalidation accumulates tags', () => {
      const runtime = createMockRuntime()
      const coordinator = createRuntimeCoordinator(runtime)

      coordinator.enqueueInvalidation(['desktop_mutation'])
      coordinator.enqueueInvalidation(['terminal_mutation', 'desktop_mutation'])

      const pending = coordinator.getPendingInvalidationTags()
      expect(pending.size).toBe(2)
      expect(pending.has('desktop_mutation')).toBe(true)
      expect(pending.has('terminal_mutation')).toBe(true)
    })

    it('refreshSnapshot drains pending tags', async () => {
      const runtime = createMockRuntime()
      const coordinator = createRuntimeCoordinator(runtime)

      coordinator.enqueueInvalidation(['terminal_mutation'])
      expect(coordinator.getPendingInvalidationTags().size).toBe(1)

      await coordinator.refreshSnapshot('tool_entry')

      expect(coordinator.getPendingInvalidationTags().size).toBe(0)
    })

    it('records facts_invalidated trace event when tags were pending', async () => {
      const runtime = createMockRuntime()
      const coordinator = createRuntimeCoordinator(runtime)

      // First refresh to establish baseline
      await coordinator.refreshSnapshot('tool_entry')
      ;(runtime.session.record as ReturnType<typeof vi.fn>).mockClear()

      // Enqueue invalidation and refresh again
      coordinator.enqueueInvalidation(['terminal_mutation'])
      await coordinator.refreshSnapshot('post_action')

      const recordCalls = (runtime.session.record as ReturnType<typeof vi.fn>).mock.calls
      const invalidationEvent = recordCalls
        .map(c => c[0])
        .find(entry => entry.event === 'runtime:facts_invalidated')

      expect(invalidationEvent).toBeDefined()
      expect(invalidationEvent.metadata.type).toBe('facts_invalidated')
      expect(invalidationEvent.metadata.tags).toContain('terminal_mutation')
      expect(invalidationEvent.metadata.keys).toContain('terminalState')
    })

    it('does not record facts_invalidated when no tags were pending', async () => {
      const runtime = createMockRuntime()
      const coordinator = createRuntimeCoordinator(runtime)

      await coordinator.refreshSnapshot('tool_entry')
      ;(runtime.session.record as ReturnType<typeof vi.fn>).mockClear()

      // Refresh without any enqueued tags
      await coordinator.refreshSnapshot('post_action')

      const recordCalls = (runtime.session.record as ReturnType<typeof vi.fn>).mock.calls
      const invalidationEvent = recordCalls
        .map(c => c[0])
        .find(entry => entry.event === 'runtime:facts_invalidated')

      expect(invalidationEvent).toBeUndefined()
    })

    it('selective reprobe: terminal_mutation re-probes terminalState but reuses displayInfo', async () => {
      const runtime = createMockRuntime()
      const coordinator = createRuntimeCoordinator(runtime)

      // First refresh — all probes fire
      await coordinator.refreshSnapshot('tool_entry')
      const initialExecutionTargetCalls = (runtime.executor.getExecutionTarget as ReturnType<typeof vi.fn>).mock.calls.length
      const initialDisplayInfoCalls = (runtime.executor.getDisplayInfo as ReturnType<typeof vi.fn>).mock.calls.length
      const initialTerminalCalls = (runtime.terminalRunner.getState as ReturnType<typeof vi.fn>).mock.calls.length

      // Enqueue terminal_mutation only
      coordinator.enqueueInvalidation(['terminal_mutation'])
      await coordinator.refreshSnapshot('post_action')

      // terminalState should have been re-probed
      const terminalCalls = (runtime.terminalRunner.getState as ReturnType<typeof vi.fn>).mock.calls.length
      expect(terminalCalls).toBe(initialTerminalCalls + 1)

      // displayInfo has no matching tags for terminal_mutation, so it should NOT be re-probed
      const displayInfoCalls = (runtime.executor.getDisplayInfo as ReturnType<typeof vi.fn>).mock.calls.length
      expect(displayInfoCalls).toBe(initialDisplayInfoCalls)

      // executionTarget maps to desktop_mutation/app_lifecycle, NOT terminal_mutation — should NOT be re-probed
      const executionTargetCalls = (runtime.executor.getExecutionTarget as ReturnType<typeof vi.fn>).mock.calls.length
      expect(executionTargetCalls).toBe(initialExecutionTargetCalls)
    })

    it('selective reprobe: desktop_mutation re-probes executionTarget and foregroundContext', async () => {
      const runtime = createMockRuntime()
      const coordinator = createRuntimeCoordinator(runtime)

      await coordinator.refreshSnapshot('tool_entry')
      const initialExecCalls = (runtime.executor.getExecutionTarget as ReturnType<typeof vi.fn>).mock.calls.length
      const initialFgCalls = (runtime.executor.getForegroundContext as ReturnType<typeof vi.fn>).mock.calls.length

      coordinator.enqueueInvalidation(['desktop_mutation'])
      await coordinator.refreshSnapshot('post_action')

      expect((runtime.executor.getExecutionTarget as ReturnType<typeof vi.fn>).mock.calls.length).toBe(initialExecCalls + 1)
      expect((runtime.executor.getForegroundContext as ReturnType<typeof vi.fn>).mock.calls.length).toBe(initialFgCalls + 1)
    })

    it('selective reprobe: desktop_mutation + app_lifecycle refreshes executionTarget/foregroundContext/browserSurfaceAvailability', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-04-07T10:00:00.000Z'))

      const runtime = createMockRuntime()
      const coordinator = createRuntimeCoordinator(runtime)

      const firstSnapshot = await coordinator.refreshSnapshot('tool_entry')

      vi.setSystemTime(new Date('2026-04-07T10:00:02.000Z'))
      coordinator.enqueueInvalidation(['desktop_mutation', 'app_lifecycle'])
      const secondSnapshot = await coordinator.refreshSnapshot('post_action')

      expect(secondSnapshot.facts.executionTarget.probedAt).toBeGreaterThan(firstSnapshot.facts.executionTarget.probedAt)
      expect(secondSnapshot.facts.foregroundContext.probedAt).toBeGreaterThan(firstSnapshot.facts.foregroundContext.probedAt)
      expect(secondSnapshot.facts.browserSurfaceAvailability.probedAt).toBeGreaterThan(firstSnapshot.facts.browserSurfaceAvailability.probedAt)

      // Unrelated to desktop/app lifecycle invalidation in current mapping.
      expect(secondSnapshot.facts.displayInfo.probedAt).toBe(firstSnapshot.facts.displayInfo.probedAt)
      expect(secondSnapshot.facts.terminalState.probedAt).toBe(firstSnapshot.facts.terminalState.probedAt)
    })

    it('selective reprobe: screenshot_refresh only updates lastScreenshot fact timing', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-04-07T11:00:00.000Z'))

      const runtime = createMockRuntime()
      runtime.session.getLastScreenshot = vi.fn()
        .mockReturnValueOnce({
          path: '/tmp/screenshot-a.png',
          width: 800,
          height: 600,
          placeholder: false,
        })
        .mockReturnValueOnce({
          path: '/tmp/screenshot-b.png',
          width: 800,
          height: 600,
          placeholder: false,
        })
      const coordinator = createRuntimeCoordinator(runtime)

      const firstSnapshot = await coordinator.refreshSnapshot('tool_entry')

      vi.setSystemTime(new Date('2026-04-07T11:00:03.000Z'))
      coordinator.enqueueInvalidation(['screenshot_refresh'])
      const secondSnapshot = await coordinator.refreshSnapshot('post_action')

      expect(secondSnapshot.facts.executionTarget.probedAt).toBe(firstSnapshot.facts.executionTarget.probedAt)
      expect(secondSnapshot.facts.foregroundContext.probedAt).toBe(firstSnapshot.facts.foregroundContext.probedAt)
      expect(secondSnapshot.facts.displayInfo.probedAt).toBe(firstSnapshot.facts.displayInfo.probedAt)
      expect(secondSnapshot.facts.terminalState.probedAt).toBe(firstSnapshot.facts.terminalState.probedAt)
      expect(secondSnapshot.facts.browserSurfaceAvailability.probedAt).toBe(firstSnapshot.facts.browserSurfaceAvailability.probedAt)
      expect(secondSnapshot.facts.cdpAvailability.probedAt).toBe(firstSnapshot.facts.cdpAvailability.probedAt)

      expect(firstSnapshot.facts.lastScreenshot?.probedAt).toBeDefined()
      expect(secondSnapshot.facts.lastScreenshot?.probedAt).toBeDefined()
      expect(secondSnapshot.facts.lastScreenshot?.probedAt).toBeGreaterThan(firstSnapshot.facts.lastScreenshot?.probedAt ?? 0)
    })

    it('without pending tags all facts are always re-probed', async () => {
      const runtime = createMockRuntime()
      const coordinator = createRuntimeCoordinator(runtime)

      await coordinator.refreshSnapshot('tool_entry')
      const calls1 = (runtime.executor.getExecutionTarget as ReturnType<typeof vi.fn>).mock.calls.length

      // No enqueue — just refresh again
      await coordinator.refreshSnapshot('verification_check')
      const calls2 = (runtime.executor.getExecutionTarget as ReturnType<typeof vi.fn>).mock.calls.length

      expect(calls2).toBe(calls1 + 1)
    })
  })
})
