import { describe, expect, it, vi } from 'vitest'

import { RunStateManager } from '../state'
import { createDisplayInfo, createLocalExecutionTarget, createTerminalState, createTestConfig } from '../test-fixtures'
import { createRuntimeCoordinator } from './runtime-coordinator'
import type { RuntimeCoordinatorHost } from './runtime-coordinator'

describe('createRuntimeCoordinator', () => {
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
})
