import type { ComputerUseServerRuntime } from './runtime'

import { describe, expect, it, vi } from 'vitest'

import { RunStateManager } from '../state'
import {
  createDisplayInfo,
  createLocalExecutionTarget,
  createRemoteExecutionTarget,
  createTerminalState,
  createTestConfig,
} from '../test-fixtures'
import { createExecuteAction } from './action-executor'
import { createRuntimeCoordinator } from './runtime-coordinator'

function createMockRuntime(params?: {
  configOverrides?: Parameters<typeof createTestConfig>[0]
  executionTarget?: ReturnType<typeof createLocalExecutionTarget> | ReturnType<typeof createRemoteExecutionTarget>
  foregroundContext?: { available: boolean, appName?: string, platform: NodeJS.Platform, unavailableReason?: string }
  foregroundContextSequence?: Array<{ available: boolean, appName?: string, platform: NodeJS.Platform, unavailableReason?: string } | Error>
  displayInfo?: ReturnType<typeof createDisplayInfo>
  lastScreenshot?: unknown
  clickImpl?: Parameters<typeof vi.fn>[0]
  takeScreenshotImpl?: Parameters<typeof vi.fn>[0]
  openAppImpl?: Parameters<typeof vi.fn>[0]
  focusAppImpl?: Parameters<typeof vi.fn>[0]
  typeTextImpl?: Parameters<typeof vi.fn>[0]
}) {
  const stateManager = new RunStateManager()
  const session = {
    listPendingActions: vi.fn().mockReturnValue([]),
    getBudgetState: vi.fn().mockReturnValue({
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    }),
    record: vi.fn().mockResolvedValue(undefined),
    createPendingAction: vi.fn((record: Record<string, unknown>) => ({
      id: 'pending-1',
      createdAt: '2026-04-07T00:00:00.000Z',
      ...record,
    })),
    consumeOperation: vi.fn(),
    getLastScreenshot: vi.fn().mockReturnValue(params?.lastScreenshot),
    setLastScreenshot: vi.fn(),
    getTerminalState: vi.fn().mockReturnValue(createTerminalState()),
    setTerminalState: vi.fn(),
    getPointerPosition: vi.fn().mockReturnValue(undefined),
    setPointerPosition: vi.fn(),
  }
  const foregroundContextMock = vi.fn()
  if (params?.foregroundContextSequence?.length) {
    for (const entry of params.foregroundContextSequence) {
      if (entry instanceof Error) {
        foregroundContextMock.mockRejectedValueOnce(entry)
      }
      else {
        foregroundContextMock.mockResolvedValueOnce(entry)
      }
    }
  }
  else {
    foregroundContextMock.mockResolvedValue(params?.foregroundContext ?? {
      available: true,
      appName: 'Finder',
      platform: 'darwin' as const,
    })
  }

  const executor = {
    kind: 'dry-run' as const,
    describe: () => ({ kind: 'dry-run' as const, notes: [] }),
    getExecutionTarget: vi.fn().mockResolvedValue(params?.executionTarget ?? createLocalExecutionTarget()),
    getForegroundContext: foregroundContextMock,
    getDisplayInfo: vi.fn().mockResolvedValue(params?.displayInfo ?? createDisplayInfo({
      platform: 'darwin',
    })),
    getPermissionInfo: vi.fn(),
    observeWindows: vi.fn(),
    takeScreenshot: vi.fn(params?.takeScreenshotImpl),
    openApp: vi.fn(params?.openAppImpl),
    focusApp: vi.fn(params?.focusAppImpl),
    click: vi.fn(params?.clickImpl),
    typeText: vi.fn(params?.typeTextImpl),
    pressKeys: vi.fn(),
    scroll: vi.fn(),
    wait: vi.fn(),
  }
  const terminalRunner = {
    describe: () => ({ kind: 'local-shell-runner' as const, notes: [] }),
    execute: vi.fn(),
    getState: vi.fn().mockReturnValue(createTerminalState()),
    resetState: vi.fn(),
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
    }),
  }

  const runtime = {
    config: createTestConfig({
      executor: 'dry-run',
      approvalMode: 'never',
      defaultCaptureAfter: false,
      ...params?.configOverrides,
    }),
    session,
    executor,
    terminalRunner,
    browserDomBridge,
    cdpBridgeManager,
    stateManager,
    taskMemory: {},
  } as unknown as ComputerUseServerRuntime

  const coordinator = createRuntimeCoordinator(runtime)
  runtime.coordinator = coordinator

  return {
    runtime,
    session,
    executor,
    cdpBridgeManager,
  }
}

describe('createExecuteAction', () => {
  it('refreshes browser surface availability for direct actions before evaluating strategy', async () => {
    const { runtime, cdpBridgeManager } = createMockRuntime({
      foregroundContext: {
        available: true,
        appName: 'Google Chrome',
        platform: 'darwin',
      },
      clickImpl: async () => ({
        performed: true,
        backend: 'dry-run' as const,
        notes: [],
      }),
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'click', input: { x: 10, y: 20, captureAfter: false } }, 'desktop_click')

    const summaryText = result.content.find(item => item.type === 'text')?.text ?? ''
    expect(summaryText).toContain('browser_dom')
    expect(runtime.stateManager.getState().browserSurfaceAvailability).toMatchObject({
      preferredSurface: 'browser_dom',
      selectedToolName: 'browser_dom_read_page',
    })
    expect(cdpBridgeManager.probeAvailability).toHaveBeenCalledTimes(2)

    const structured = result.structuredContent as Record<string, any>
    expect(structured.transparency.advisories).toContainEqual(expect.objectContaining({
      kind: 'use_browser_surface',
      reason: expect.stringContaining('extension DOM stack is preferred'),
    }))
  })

  it('keeps mutation readiness denial behavior using contract-driven mutate gate', async () => {
    const { runtime, session, executor } = createMockRuntime({
      configOverrides: {
        executor: 'linux-x11',
        approvalMode: 'never',
      },
      executionTarget: createRemoteExecutionTarget({
        sessionTag: 'vm-local-1',
        displayId: ':99',
        tainted: false,
      }),
      foregroundContext: {
        available: true,
        appName: 'Terminal',
        platform: 'linux',
      },
      displayInfo: createDisplayInfo({
        platform: 'linux',
        logicalWidth: 1280,
        logicalHeight: 720,
      }),
      lastScreenshot: undefined,
      clickImpl: async () => ({
        performed: true,
        backend: 'dry-run' as const,
        notes: [],
      }),
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'click', input: { x: 20, y: 20, captureAfter: false } }, 'desktop_click')

    expect(result.isError).toBe(true)
    expect((result.structuredContent as Record<string, any>).status).toBe('denied')
    expect(executor.click).not.toHaveBeenCalled()

    const deniedRecord = session.record.mock.calls
      .map(call => call[0])
      .find(entry => entry.event === 'denied')
    expect(deniedRecord.metadata).toMatchObject({
      effectType: 'mutate',
      targetSurface: 'desktop',
      postconditionRequired: true,
      approvalScope: 'per_action',
    })
  })

  it('records contract summary metadata for executed events', async () => {
    const { runtime, session } = createMockRuntime({
      configOverrides: {
        executor: 'linux-x11',
        approvalMode: 'never',
      },
      executionTarget: createRemoteExecutionTarget({
        sessionTag: 'vm-local-1',
        displayId: ':99',
        tainted: false,
      }),
      foregroundContext: {
        available: true,
        appName: 'Terminal',
        platform: 'linux',
      },
      displayInfo: createDisplayInfo({
        platform: 'linux',
        logicalWidth: 1280,
        logicalHeight: 720,
      }),
      takeScreenshotImpl: async () => ({
        dataBase64: 'ZmFrZQ==',
        mimeType: 'image/png' as const,
        path: '/tmp/fake-screenshot.png',
        width: 1280,
        height: 720,
        placeholder: false,
        executionTargetMode: 'remote' as const,
        sourceHostName: 'fake-remote',
        sourceDisplayId: ':99',
        sourceSessionTag: 'vm-local-1',
      }),
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'screenshot', input: {} }, 'desktop_screenshot')

    expect(result.isError).not.toBe(true)

    const records = session.record.mock.calls.map(call => call[0])
    const requestedRecord = records.find(entry => entry.event === 'requested')
    const executedRecord = records.find(entry => entry.event === 'executed')

    expect(requestedRecord?.metadata).toMatchObject({
      effectType: 'observe',
      targetSurface: 'desktop',
      postconditionRequired: false,
      approvalScope: 'none',
    })
    expect(requestedRecord?.metadata).not.toHaveProperty('verification')
    expect(executedRecord?.metadata).toMatchObject({
      effectType: 'observe',
      targetSurface: 'desktop',
      postconditionRequired: false,
      approvalScope: 'none',
    })
    expect(executedRecord?.metadata).not.toHaveProperty('verification')
  })

  it('records contract summary metadata for failed events', async () => {
    const { runtime, session } = createMockRuntime({
      clickImpl: async () => {
        throw new Error('synthetic click failure')
      },
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'click', input: { x: 10, y: 20, captureAfter: false } }, 'desktop_click')

    expect(result.isError).toBe(true)
    expect((result.structuredContent as Record<string, any>).status).toBe('failed')

    const failedRecord = session.record.mock.calls
      .map(call => call[0])
      .find(entry => entry.event === 'failed')

    expect(failedRecord?.metadata).toMatchObject({
      effectType: 'mutate',
      targetSurface: 'desktop',
      postconditionRequired: true,
      approvalScope: 'per_action',
      verification: {
        requirement: 'required',
        method: 'surface_observation_refresh',
        failureDisposition: 'repair_hint',
        repairHint: 'refresh_surface_observation',
      },
    })
  })

  it('records contract summary metadata for approval_required events', async () => {
    const { runtime, session } = createMockRuntime({
      configOverrides: {
        approvalMode: 'actions',
      },
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'click', input: { x: 10, y: 20, captureAfter: false } }, 'desktop_click')

    expect(result.isError).not.toBe(true)

    const approvalRecord = session.record.mock.calls
      .map(call => call[0])
      .find(entry => entry.event === 'approval_required')

    expect(approvalRecord?.metadata).toMatchObject({
      effectType: 'mutate',
      targetSurface: 'desktop',
      postconditionRequired: true,
      approvalScope: 'per_action',
      verification: {
        requirement: 'required',
        method: 'surface_observation_refresh',
        failureDisposition: 'repair_hint',
        repairHint: 'refresh_surface_observation',
      },
    })
  })

  it('records verification summary metadata for click/open_app/focus_app traces', async () => {
    const actionCases = [
      {
        action: { kind: 'click', input: { x: 10, y: 20, captureAfter: false } } as const,
        expectedVerification: {
          requirement: 'required',
          method: 'surface_observation_refresh',
          failureDisposition: 'repair_hint',
          repairHint: 'refresh_surface_observation',
        },
      },
      {
        action: { kind: 'open_app', input: { app: 'Terminal' } } as const,
        expectedVerification: {
          requirement: 'required',
          method: 'foreground_match',
          failureDisposition: 'repair_hint',
          repairHint: 'reopen_target_app',
        },
      },
      {
        action: { kind: 'focus_app', input: { app: 'Terminal' } } as const,
        expectedVerification: {
          requirement: 'required',
          method: 'foreground_match',
          failureDisposition: 'repair_hint',
          repairHint: 'refocus_target_app',
        },
      },
    ]

    for (const actionCase of actionCases) {
      const { runtime, session } = createMockRuntime({
        configOverrides: {
          approvalMode: 'never',
        },
      })

      const executeAction = createExecuteAction(runtime)
      await executeAction(actionCase.action, `tool_${actionCase.action.kind}`)

      const requestedRecord = session.record.mock.calls
        .map(call => call[0])
        .find(entry => entry.event === 'requested' && entry.action?.kind === actionCase.action.kind)

      expect(requestedRecord?.metadata).toMatchObject({
        verification: actionCase.expectedVerification,
      })
    }
  })

  it('does not write verification metadata for requirement=none actions', async () => {
    const { runtime, session } = createMockRuntime({
      configOverrides: {
        approvalMode: 'never',
      },
      takeScreenshotImpl: async () => ({
        dataBase64: 'ZmFrZQ==',
        mimeType: 'image/png' as const,
        path: '/tmp/fake-screenshot.png',
        width: 1280,
        height: 720,
        placeholder: false,
        executionTargetMode: 'local-windowed' as const,
        sourceHostName: 'fake-local',
      }),
    })

    const executeAction = createExecuteAction(runtime)
    await executeAction({ kind: 'screenshot', input: {} }, 'desktop_screenshot')
    await executeAction({ kind: 'coding_read_file', input: { filePath: '/tmp/mock.ts' } }, 'coding_read_file')

    const requestedRecords = session.record.mock.calls
      .map(call => call[0])
      .filter(entry => entry.event === 'requested' && ['screenshot', 'coding_read_file'].includes(String(entry.action?.kind)))

    expect(requestedRecords).toHaveLength(2)
    for (const record of requestedRecords) {
      expect(record.metadata).not.toHaveProperty('verification')
    }
  })

  it('passes foreground-match verification for focus_app after refreshed observation', async () => {
    const { runtime, executor } = createMockRuntime({
      configOverrides: {
        approvalMode: 'never',
      },
      foregroundContextSequence: [
        { available: true, appName: 'Finder', platform: 'darwin' },
        { available: true, appName: 'Terminal', platform: 'darwin' },
      ],
      focusAppImpl: async () => ({
        performed: true,
        backend: 'dry-run' as const,
        notes: [],
      }),
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'focus_app', input: { app: 'Terminal' } }, 'desktop_focus_app')

    expect(result.isError).not.toBe(true)
    expect((result.structuredContent as Record<string, any>).status).toBe('executed')
    expect(executor.getForegroundContext).toHaveBeenCalledTimes(2)
  })

  it('repairs focus_app verification failure and succeeds without approval queue', async () => {
    const { runtime, session, executor } = createMockRuntime({
      configOverrides: {
        approvalMode: 'never',
      },
      foregroundContextSequence: [
        { available: true, appName: 'Finder', platform: 'darwin' },
        { available: true, appName: 'Cursor', platform: 'darwin' },
        { available: true, appName: 'Terminal', platform: 'darwin' },
      ],
      focusAppImpl: async () => ({
        performed: true,
        backend: 'dry-run' as const,
        notes: [],
      }),
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'focus_app', input: { app: 'Terminal' } }, 'desktop_focus_app')

    expect(result.isError).not.toBe(true)
    expect((result.structuredContent as Record<string, any>).status).toBe('executed')
    expect((result.structuredContent as Record<string, any>).backendResult?.verificationRecovery).toBeUndefined()
    expect(session.createPendingAction).not.toHaveBeenCalled()
    expect(executor.focusApp).toHaveBeenCalledTimes(2)

    const events = session.record.mock.calls.map(call => call[0].event)
    expect(events).toContain('verification_failed')
    expect(events).toContain('repair_attempted')
    expect(events).toContain('repair_succeeded')
  })

  it('fails focus_app when repair does not recover foreground match', async () => {
    const { runtime, session } = createMockRuntime({
      configOverrides: {
        approvalMode: 'never',
      },
      foregroundContextSequence: [
        { available: true, appName: 'Finder', platform: 'darwin' },
        { available: true, appName: 'Cursor', platform: 'darwin' },
        { available: true, appName: 'Cursor', platform: 'darwin' },
      ],
      focusAppImpl: async () => ({
        performed: true,
        backend: 'dry-run' as const,
        notes: [],
      }),
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'focus_app', input: { app: 'Terminal' } }, 'desktop_focus_app')

    expect(result.isError).toBe(true)
    expect((result.structuredContent as Record<string, any>).status).toBe('failed')
    expect((result.structuredContent as Record<string, any>).verification).toMatchObject({
      status: 'failed',
      method: 'foreground_match',
      failureDisposition: 'repair_hint',
      repairHint: 'refocus_target_app',
      reason: expect.stringContaining('expected foreground app "Terminal"'),
      repairAttempt: expect.objectContaining({
        attempted: true,
        succeeded: true,
      }),
    })

    const events = session.record.mock.calls.map(call => call[0].event)
    expect(events).toContain('verification_failed')
    expect(events).toContain('repair_attempted')
    expect(events).toContain('repair_failed')
  })

  it('does not re-execute click during verification repair flow', async () => {
    const { runtime, session, executor } = createMockRuntime({
      configOverrides: {
        approvalMode: 'never',
      },
      foregroundContextSequence: [
        { available: false, platform: 'darwin', unavailableReason: 'no accessibility context' },
        { available: false, platform: 'darwin', unavailableReason: 'no accessibility context' },
        { available: false, platform: 'darwin', unavailableReason: 'no accessibility context' },
      ],
      clickImpl: async () => ({
        performed: true,
        backend: 'dry-run' as const,
        notes: [],
      }),
      takeScreenshotImpl: async () => ({
        dataBase64: 'ZmFrZQ==',
        mimeType: 'image/png' as const,
        path: '/tmp/fake-repair-screenshot.png',
        width: 1280,
        height: 720,
        placeholder: false,
        executionTargetMode: 'local-windowed' as const,
        sourceHostName: 'fake-local',
      }),
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'click', input: { x: 10, y: 20, captureAfter: false } }, 'desktop_click')

    expect(result.isError).not.toBe(true)
    expect((result.structuredContent as Record<string, any>).status).toBe('executed')
    expect((result.structuredContent as Record<string, any>).backendResult?.verificationRecovery).toBeUndefined()
    expect(executor.click).toHaveBeenCalledTimes(1)
    expect(executor.takeScreenshot).toHaveBeenCalledTimes(1)

    const events = session.record.mock.calls.map(call => call[0].event)
    expect(events).toContain('verification_failed')
    expect(events).toContain('repair_attempted')
    expect(events).toContain('repair_succeeded')
  })

  it('counts one extra operation unit bundle for app repair attempts', async () => {
    for (const action of [
      { kind: 'open_app', input: { app: 'Terminal' } } as const,
      { kind: 'focus_app', input: { app: 'Terminal' } } as const,
    ]) {
      const { runtime, session } = createMockRuntime({
        configOverrides: {
          approvalMode: 'never',
        },
        foregroundContextSequence: [
          { available: true, appName: 'Finder', platform: 'darwin' },
          { available: true, appName: 'Cursor', platform: 'darwin' },
          { available: true, appName: 'Terminal', platform: 'darwin' },
        ],
        openAppImpl: async () => ({
          performed: true,
          backend: 'dry-run' as const,
          notes: [],
        }),
        focusAppImpl: async () => ({
          performed: true,
          backend: 'dry-run' as const,
          notes: [],
        }),
      })

      const executeAction = createExecuteAction(runtime)
      const result = await executeAction(action, `tool_${action.kind}`)

      expect(result.isError).not.toBe(true)
      expect(session.consumeOperation).toHaveBeenCalledTimes(2)
      expect(session.consumeOperation).toHaveBeenNthCalledWith(1, 2)
      expect(session.consumeOperation).toHaveBeenNthCalledWith(2, 2)
    }
  })

  it('does not add extra operation units for refresh_surface_observation repair', async () => {
    const { runtime, session } = createMockRuntime({
      configOverrides: {
        approvalMode: 'never',
      },
      foregroundContextSequence: [
        { available: false, platform: 'darwin', unavailableReason: 'no accessibility context' },
        { available: false, platform: 'darwin', unavailableReason: 'no accessibility context' },
        { available: false, platform: 'darwin', unavailableReason: 'no accessibility context' },
      ],
      clickImpl: async () => ({
        performed: true,
        backend: 'dry-run' as const,
        notes: [],
      }),
      takeScreenshotImpl: async () => ({
        dataBase64: 'ZmFrZQ==',
        mimeType: 'image/png' as const,
        path: '/tmp/fake-repair-screenshot.png',
        width: 1280,
        height: 720,
        placeholder: false,
        executionTargetMode: 'local-windowed' as const,
        sourceHostName: 'fake-local',
      }),
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'click', input: { x: 10, y: 20, captureAfter: false } }, 'desktop_click')

    expect(result.isError).not.toBe(true)
    expect((result.structuredContent as Record<string, any>).status).toBe('executed')
    expect(session.consumeOperation).toHaveBeenCalledTimes(1)
    expect(session.consumeOperation).toHaveBeenNthCalledWith(1, 1)
  })

  it('enqueues app repair invalidation before repair_check refresh for focus_app', async () => {
    const { runtime, executor } = createMockRuntime({
      configOverrides: {
        approvalMode: 'never',
      },
      foregroundContextSequence: [
        { available: true, appName: 'Finder', platform: 'darwin' },
        { available: true, appName: 'Cursor', platform: 'darwin' },
        { available: true, appName: 'Terminal', platform: 'darwin' },
      ],
      focusAppImpl: async () => ({
        performed: true,
        backend: 'dry-run' as const,
        notes: [],
      }),
    })

    const enqueueSpy = vi.spyOn(runtime.coordinator, 'enqueueInvalidation')
    const refreshSpy = vi.spyOn(runtime.coordinator, 'refreshSnapshot')

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'focus_app', input: { app: 'Terminal' } }, 'desktop_focus_app')

    expect(result.isError).not.toBe(true)
    expect(executor.getForegroundContext).toHaveBeenCalledTimes(3)

    const repairCheckCallIndex = refreshSpy.mock.calls.findIndex(call => call[0] === 'repair_check')
    expect(repairCheckCallIndex).toBeGreaterThan(-1)

    const repairCheckCallOrder = refreshSpy.mock.invocationCallOrder[repairCheckCallIndex]!
    const repairScopedEnqueue = enqueueSpy.mock.calls
      .map((call, index) => ({ tags: call[0], order: enqueueSpy.mock.invocationCallOrder[index]! }))
      .find(entry => Array.isArray(entry.tags)
        && entry.tags.includes('app_lifecycle')
        && entry.tags.includes('desktop_mutation')
        && entry.order < repairCheckCallOrder)

    expect(repairScopedEnqueue).toBeDefined()
  })

  it('enqueues app repair invalidation for open_app recheck', async () => {
    const { runtime, executor } = createMockRuntime({
      configOverrides: {
        approvalMode: 'never',
      },
      foregroundContextSequence: [
        { available: true, appName: 'Finder', platform: 'darwin' },
        { available: true, appName: 'Cursor', platform: 'darwin' },
        { available: true, appName: 'Terminal', platform: 'darwin' },
      ],
      openAppImpl: async () => ({
        performed: true,
        backend: 'dry-run' as const,
        notes: [],
      }),
    })

    const enqueueSpy = vi.spyOn(runtime.coordinator, 'enqueueInvalidation')

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'open_app', input: { app: 'Terminal' } }, 'desktop_open_app')

    expect(result.isError).not.toBe(true)
    expect(executor.getForegroundContext).toHaveBeenCalledTimes(3)
    expect(enqueueSpy).toHaveBeenCalledWith(['app_lifecycle', 'desktop_mutation'])
  })

  it('observation repair enqueue includes screenshot_refresh when repair captures screenshot', async () => {
    const { runtime, executor } = createMockRuntime({
      configOverrides: {
        approvalMode: 'never',
      },
      foregroundContextSequence: [
        { available: false, platform: 'darwin', unavailableReason: 'no accessibility context' },
        { available: false, platform: 'darwin', unavailableReason: 'no accessibility context' },
        { available: false, platform: 'darwin', unavailableReason: 'no accessibility context' },
      ],
      clickImpl: async () => ({
        performed: true,
        backend: 'dry-run' as const,
        notes: [],
      }),
      takeScreenshotImpl: async () => ({
        dataBase64: 'ZmFrZQ==',
        mimeType: 'image/png' as const,
        path: '/tmp/repair-captured.png',
        executionTargetMode: 'local-windowed' as const,
      }),
    })

    const enqueueSpy = vi.spyOn(runtime.coordinator, 'enqueueInvalidation')
    const refreshSpy = vi.spyOn(runtime.coordinator, 'refreshSnapshot')

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'click', input: { x: 12, y: 24, captureAfter: false } }, 'desktop_click')

    expect(result.isError).not.toBe(true)
    expect(executor.takeScreenshot).toHaveBeenCalledTimes(1)

    const repairCheckCallIndex = refreshSpy.mock.calls.findIndex(call => call[0] === 'repair_check')
    expect(repairCheckCallIndex).toBeGreaterThan(-1)

    const repairCheckCallOrder = refreshSpy.mock.invocationCallOrder[repairCheckCallIndex]!
    const repairScopedEnqueue = enqueueSpy.mock.calls
      .map((call, index) => ({ tags: call[0], order: enqueueSpy.mock.invocationCallOrder[index]! }))
      .find(entry => Array.isArray(entry.tags)
        && entry.tags.includes('desktop_mutation')
        && entry.tags.includes('screenshot_refresh')
        && entry.order < repairCheckCallOrder)

    expect(repairScopedEnqueue).toBeDefined()
  })

  it('does not enqueue repair invalidation tags when repair attempt fails', async () => {
    let focusInvocationCount = 0
    const { runtime } = createMockRuntime({
      configOverrides: {
        approvalMode: 'never',
      },
      foregroundContextSequence: [
        { available: true, appName: 'Finder', platform: 'darwin' },
        { available: true, appName: 'Cursor', platform: 'darwin' },
      ],
      focusAppImpl: async () => {
        focusInvocationCount += 1
        if (focusInvocationCount === 1) {
          return {
            performed: true,
            backend: 'dry-run' as const,
            notes: [],
          }
        }

        throw new Error('repair focus failed')
      },
    })

    const enqueueSpy = vi.spyOn(runtime.coordinator, 'enqueueInvalidation')
    const refreshSpy = vi.spyOn(runtime.coordinator, 'refreshSnapshot')

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'focus_app', input: { app: 'Terminal' } }, 'desktop_focus_app')

    expect(result.isError).toBe(true)

    const repairCheckCall = refreshSpy.mock.calls.find(call => call[0] === 'repair_check')
    expect(repairCheckCall).toBeUndefined()

    const repairScopedEnqueue = enqueueSpy.mock.calls
      .map(call => call[0])
      .filter(tags => Array.isArray(tags)
        && tags.includes('app_lifecycle')
        && tags.includes('desktop_mutation'))
    expect(repairScopedEnqueue).toHaveLength(0)
  })
})
