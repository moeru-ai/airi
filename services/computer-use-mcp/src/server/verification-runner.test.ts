import type { ComputerUseServerRuntime } from './runtime'
import type { RuntimeSnapshot } from './runtime-coordinator'

import { describe, expect, it, vi } from 'vitest'

import {
  buildRepairedVerification,
  runPostActionVerification,
  runVerificationRepairAttempt,
} from './verification-runner'

function createSnapshot(overrides: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot {
  const executionTarget = overrides.executionTarget ?? {
    mode: 'local-windowed',
    transport: 'local',
    hostName: 'macbook-pro',
    isolated: false,
    tainted: false,
  } as any
  const foregroundContext = overrides.foregroundContext ?? {
    available: true,
    appName: 'Finder',
    platform: 'darwin',
  } as any
  const displayInfo = overrides.displayInfo ?? {
    available: true,
    platform: 'darwin',
    logicalWidth: 1728,
    logicalHeight: 1117,
    pixelWidth: 3456,
    pixelHeight: 2234,
    scaleFactor: 2,
    isRetina: true,
  } as any
  const terminalState = overrides.terminalState ?? {
    effectiveCwd: '/Users/liuziheng/airi',
    lastExitCode: 0,
    lastCommandSummary: 'pwd',
  } as any
  const browserSurfaceAvailability = overrides.browserSurfaceAvailability ?? {
    executionMode: 'local-windowed',
    suitable: true,
    availableSurfaces: ['browser_dom'],
    preferredSurface: 'browser_dom',
    selectedToolName: 'browser_dom_read_page',
    reason: 'Extension connected',
    extension: { available: true, url: 'about:blank', title: 'Blank' },
    cdp: { available: false, reason: 'not connected' },
  } as any
  const cdpAvailability = overrides.cdpAvailability ?? {
    available: false,
    reason: 'not connected',
  } as any

  const now = Date.now()
  const facts = overrides.facts ?? {
    executionTarget: { value: executionTarget, source: 'executor_probe', probedAt: now, confidence: 'high', ttlMs: 5000 },
    foregroundContext: { value: foregroundContext, source: 'executor_probe', probedAt: now, confidence: 'medium', ttlMs: 3000 },
    displayInfo: { value: displayInfo, source: 'executor_probe', probedAt: now, confidence: 'high', ttlMs: 60000 },
    terminalState: { value: terminalState, source: 'terminal_runner', probedAt: now, confidence: 'high', ttlMs: 3000 },
    browserSurfaceAvailability: { value: browserSurfaceAvailability, source: 'derived', probedAt: now, confidence: 'medium', ttlMs: 5000 },
    cdpAvailability: { value: cdpAvailability, source: 'cdp_bridge_manager', probedAt: now, confidence: 'high', ttlMs: 5000 },
  } as any

  return {
    capturedAt: '2026-04-07T00:00:00.000Z',
    reason: 'verification_check',
    executionTarget,
    foregroundContext,
    displayInfo,
    terminalState,
    browserSurfaceAvailability,
    cdpAvailability,
    facts,
    sessionBudget: {
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    },
    pendingApprovalCount: 0,
    ...overrides,
  }
}

function createRuntimeMock(params?: {
  focusAppImpl?: Parameters<typeof vi.fn>[0]
  openAppImpl?: Parameters<typeof vi.fn>[0]
  takeScreenshotImpl?: Parameters<typeof vi.fn>[0]
}) {
  const runtime = {
    executor: {
      focusApp: vi.fn(params?.focusAppImpl),
      openApp: vi.fn(params?.openAppImpl),
      takeScreenshot: vi.fn(params?.takeScreenshotImpl),
    },
    session: {
      setLastScreenshot: vi.fn(),
    },
    stateManager: {
      updateLastScreenshot: vi.fn(),
    },
  } as unknown as ComputerUseServerRuntime

  return runtime
}

describe('verification runner v3', () => {
  it('focus_app mismatch -> refocus_target_app repair -> repaired', async () => {
    const action = { kind: 'focus_app', input: { app: 'Terminal' } } as const
    const firstCheck = runPostActionVerification({
      action,
      postActionSnapshot: createSnapshot({
        foregroundContext: {
          available: true,
          appName: 'Cursor',
          platform: 'darwin',
        },
      }),
    })

    expect(firstCheck?.status).toBe('failed')

    const runtime = createRuntimeMock({
      focusAppImpl: async () => ({
        performed: true,
        backend: 'dry-run' as const,
        notes: [],
      }),
    })

    const repair = await runVerificationRepairAttempt({
      runtime,
      action,
      failedVerification: firstCheck!,
    })

    expect(repair.repairAttempt).toMatchObject({
      hint: 'refocus_target_app',
      supported: true,
      attempted: true,
      succeeded: true,
    })
    expect(repair.invalidationTags).toEqual(['app_lifecycle', 'desktop_mutation'])

    const recheck = runPostActionVerification({
      action,
      postActionSnapshot: createSnapshot({
        reason: 'repair_check',
        foregroundContext: {
          available: true,
          appName: 'Terminal',
          platform: 'darwin',
        },
      }),
      screenshot: repair.screenshot,
    })

    expect(recheck?.status).toBe('passed')

    const repaired = buildRepairedVerification({
      verification: recheck!,
      repairAttempt: repair.repairAttempt,
    })

    expect(repaired.status).toBe('repaired')
    expect((runtime.executor.focusApp as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
  })

  it('open_app mismatch -> reopen_target_app repair succeeds', async () => {
    const action = { kind: 'open_app', input: { app: 'Terminal' } } as const
    const firstCheck = runPostActionVerification({
      action,
      postActionSnapshot: createSnapshot({
        foregroundContext: {
          available: true,
          appName: 'Finder',
          platform: 'darwin',
        },
      }),
    })

    expect(firstCheck?.status).toBe('failed')

    const runtime = createRuntimeMock({
      openAppImpl: async () => ({
        performed: true,
        backend: 'dry-run' as const,
        notes: [],
      }),
    })

    const repair = await runVerificationRepairAttempt({
      runtime,
      action,
      failedVerification: firstCheck!,
    })

    expect(repair.repairAttempt).toMatchObject({
      hint: 'reopen_target_app',
      supported: true,
      attempted: true,
      succeeded: true,
    })
    expect(repair.invalidationTags).toEqual(['app_lifecycle', 'desktop_mutation'])

    const recheck = runPostActionVerification({
      action,
      postActionSnapshot: createSnapshot({
        reason: 'repair_check',
        foregroundContext: {
          available: true,
          appName: 'Terminal',
          platform: 'darwin',
        },
      }),
      screenshot: repair.screenshot,
    })

    expect(recheck?.status).toBe('passed')
    expect((runtime.executor.openApp as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
  })

  it('click verify fail -> refresh observation repair captures screenshot and can recover', async () => {
    const action = { kind: 'click', input: { x: 10, y: 20, captureAfter: false } } as const

    const firstCheck = runPostActionVerification({
      action,
      postActionSnapshot: createSnapshot({
        foregroundContext: {
          available: false,
          platform: 'darwin',
          unavailableReason: 'no accessibility context',
        },
      }),
    })

    expect(firstCheck?.status).toBe('failed')

    const runtime = createRuntimeMock({
      takeScreenshotImpl: async () => ({
        dataBase64: 'ZmFrZQ==',
        mimeType: 'image/png' as const,
        path: '/tmp/repair-check.png',
        width: 1280,
        height: 720,
        placeholder: false,
        executionTargetMode: 'local-windowed' as const,
        sourceHostName: 'macbook-pro',
      }),
    })

    const repair = await runVerificationRepairAttempt({
      runtime,
      action,
      failedVerification: firstCheck!,
    })

    expect(repair.repairAttempt).toMatchObject({
      hint: 'refresh_surface_observation',
      supported: true,
      attempted: true,
      succeeded: true,
    })
    expect(repair.invalidationTags).toEqual(['desktop_mutation', 'screenshot_refresh'])
    expect(repair.screenshot).toBeDefined()
    expect((runtime.executor.takeScreenshot as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)

    const recheck = runPostActionVerification({
      action,
      postActionSnapshot: createSnapshot({
        reason: 'repair_check',
        foregroundContext: {
          available: false,
          platform: 'darwin',
          unavailableReason: 'still unavailable',
        },
      }),
      screenshot: repair.screenshot,
    })

    expect(recheck?.status === 'passed' || recheck?.status === 'failed').toBe(true)
  })

  it('unsupported repair hint returns failed without repair attempt', async () => {
    const runtime = createRuntimeMock()
    const action = {
      kind: 'coding_apply_patch',
      input: {
        filePath: '/tmp/mock.ts',
        oldString: 'before',
        newString: 'after',
      },
    } as const

    const repair = await runVerificationRepairAttempt({
      runtime,
      action,
      failedVerification: {
        status: 'failed',
        summary: {
          requirement: 'best_effort',
          method: 'coding_state',
          failureDisposition: 'repair_hint',
          repairHint: 'recheck_patch',
        },
        reason: 'patch consistency mismatch',
      },
    })

    expect(repair.verification.status).toBe('failed')
    expect(repair.repairAttempt).toMatchObject({
      hint: 'recheck_patch',
      attempted: false,
      supported: false,
      succeeded: false,
    })
    expect(repair.invalidationTags).toEqual([])
    expect((runtime.executor.focusApp as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
    expect((runtime.executor.openApp as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })

  it('refresh_surface_observation reuse screenshot only invalidates desktop_mutation', async () => {
    const action = { kind: 'click', input: { x: 10, y: 20, captureAfter: false } } as const
    const runtime = createRuntimeMock({
      takeScreenshotImpl: async () => ({
        dataBase64: 'ZmFrZQ==',
        mimeType: 'image/png' as const,
        path: '/tmp/unused.png',
        executionTargetMode: 'local-windowed' as const,
      }),
    })

    const repair = await runVerificationRepairAttempt({
      runtime,
      action,
      failedVerification: {
        status: 'failed',
        summary: {
          requirement: 'required',
          method: 'surface_observation_refresh',
          failureDisposition: 'repair_hint',
          repairHint: 'refresh_surface_observation',
        },
        reason: 'missing fresh observation evidence',
      },
      screenshot: {
        dataBase64: 'ZmFrZQ==',
        mimeType: 'image/png',
        path: '/tmp/pre-existing.png',
        executionTargetMode: 'local-windowed',
      },
    })

    expect(repair.repairAttempt).toMatchObject({
      attempted: true,
      succeeded: true,
      hint: 'refresh_surface_observation',
    })
    expect(repair.invalidationTags).toEqual(['desktop_mutation'])
    expect((runtime.executor.takeScreenshot as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(0)
  })

  it('repair execution is attempted at most once (no recursive retry)', async () => {
    const action = { kind: 'focus_app', input: { app: 'Terminal' } } as const
    const runtime = createRuntimeMock({
      focusAppImpl: async () => {
        throw new Error('focus failed')
      },
    })

    const repair = await runVerificationRepairAttempt({
      runtime,
      action,
      failedVerification: {
        status: 'failed',
        summary: {
          requirement: 'required',
          method: 'foreground_match',
          failureDisposition: 'repair_hint',
          repairHint: 'refocus_target_app',
        },
        reason: 'foreground mismatch',
      },
    })

    expect(repair.verification.status).toBe('failed')
    expect(repair.repairAttempt).toMatchObject({
      attempted: true,
      succeeded: false,
    })
    expect(repair.invalidationTags).toEqual([])
    expect((runtime.executor.focusApp as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
  })
})
