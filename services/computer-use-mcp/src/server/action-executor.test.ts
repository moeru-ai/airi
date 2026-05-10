import type { ComputerUseConfig } from '../types'
import type { ComputerUseServerRuntime } from './runtime'

import { describe, expect, it, vi } from 'vitest'

import { RunStateManager } from '../state'
import { createDisplayInfo, createLocalExecutionTarget, createTerminalState, createTestConfig } from '../test-fixtures'
import { createExecuteAction } from './action-executor'

function createRuntimeForActionTest(configOverrides: Partial<ComputerUseConfig> = {}) {
  const stateManager = new RunStateManager()
  const session = {
    listPendingActions: vi.fn().mockReturnValue([]),
    getBudgetState: vi.fn().mockReturnValue({
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    }),
    record: vi.fn().mockResolvedValue(undefined),
    createPendingAction: vi.fn(),
    consumeOperation: vi.fn(),
    getLastScreenshot: vi.fn().mockReturnValue(undefined),
    setLastScreenshot: vi.fn(),
    getTerminalState: vi.fn().mockReturnValue(createTerminalState()),
    setTerminalState: vi.fn(),
    getPointerPosition: vi.fn().mockReturnValue(undefined),
    setPointerPosition: vi.fn(),
  }
  const executor = {
    kind: 'dry-run' as const,
    describe: () => ({ kind: 'dry-run' as const, notes: [] }),
    getExecutionTarget: vi.fn().mockResolvedValue(createLocalExecutionTarget()),
    getForegroundContext: vi.fn().mockResolvedValue({
      available: true,
      appName: 'Google Chrome',
      platform: 'darwin',
    }),
    getDisplayInfo: vi.fn().mockResolvedValue(createDisplayInfo({
      platform: 'darwin',
    })),
    getPermissionInfo: vi.fn(),
    observeWindows: vi.fn(),
    takeScreenshot: vi.fn(),
    openApp: vi.fn(),
    focusApp: vi.fn(),
    click: vi.fn().mockResolvedValue({
      performed: true,
      backend: 'dry-run' as const,
      notes: [],
    }),
    typeText: vi.fn(),
    pressKeys: vi.fn(),
    scroll: vi.fn(),
    wait: vi.fn(),
  }
  const desktopSessionController = {
    getSession: vi.fn().mockReturnValue(null),
    ensureControlledAppInForeground: vi.fn(),
    touch: vi.fn(),
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
    supportsAction: vi.fn().mockReturnValue(true),
    clickSelector: vi.fn().mockResolvedValue(undefined),
    checkCheckbox: vi.fn().mockResolvedValue(undefined),
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
      ...configOverrides,
    }),
    session,
    executor,
    terminalRunner,
    browserDomBridge,
    cdpBridgeManager,
    stateManager,
    taskMemory: {},
    desktopSessionController,
    chromeSessionManager: {},
  } as unknown as ComputerUseServerRuntime

  return {
    runtime,
    session,
    executor,
    cdpBridgeManager,
    stateManager,
    desktopSessionController,
  }
}

function createMultiDisplayInfo() {
  return createDisplayInfo({
    platform: 'darwin',
    logicalWidth: 1512,
    logicalHeight: 982,
    pixelWidth: 3024,
    pixelHeight: 1964,
    scaleFactor: 2,
    isRetina: true,
    displayCount: 2,
    displays: [
      {
        displayId: 1,
        isMain: true,
        isBuiltIn: true,
        bounds: { x: 0, y: 0, width: 1512, height: 982 },
        visibleBounds: { x: 0, y: 65, width: 1512, height: 884 },
        scaleFactor: 2,
        pixelWidth: 3024,
        pixelHeight: 1964,
      },
      {
        displayId: 3,
        isMain: false,
        isBuiltIn: false,
        bounds: { x: -222, y: -1080, width: 1920, height: 1080 },
        visibleBounds: { x: -222, y: -1080, width: 1920, height: 1080 },
        scaleFactor: 1,
        pixelWidth: 1920,
        pixelHeight: 1080,
      },
    ],
    combinedBounds: { x: -222, y: -1080, width: 1920, height: 2062 },
    capturedAt: '2026-04-27T00:00:00.000Z',
  })
}

function createCombinedDisplayBoundsConfig() {
  return {
    allowedBounds: { x: -222, y: -1080, width: 1920, height: 2062 },
  }
}

describe('createExecuteAction', () => {
  it('executes desktop_click_target through the shared policy and audit pipeline', async () => {
    const { runtime, executor, session, stateManager } = createRuntimeForActionTest()
    stateManager.updateGroundingSnapshot({
      snapshotId: 'dg_1',
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      windows: [],
      screenshot: {
        dataBase64: '',
        mimeType: 'image/png',
        path: '',
        capturedAt: new Date().toISOString(),
      },
      targetCandidates: [
        {
          id: 't_0',
          source: 'ax',
          appName: 'Google Chrome',
          role: 'AXButton',
          label: 'Submit',
          bounds: { x: 100, y: 200, width: 80, height: 30 },
          confidence: 0.95,
          interactable: true,
        },
      ],
      staleFlags: { screenshot: false, ax: false, chromeSemantic: false },
    } as any)

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'desktop_click_target', input: { candidateId: 't_0' } }, 'desktop_click_target')

    expect(result.isError).not.toBe(true)
    expect(executor.click).toHaveBeenCalledWith(expect.objectContaining({
      x: 140,
      y: 215,
      button: 'left',
      clickCount: 1,
      pointerTrace: [{ x: 140, y: 215, delayMs: 0 }],
    }))
    expect(session.consumeOperation).toHaveBeenCalledWith(1)
    expect(session.setPointerPosition).toHaveBeenCalledWith({ x: 140, y: 215 })
    expect(session.record).toHaveBeenCalledWith(expect.objectContaining({
      event: 'executed',
      toolName: 'desktop_click_target',
      action: { kind: 'desktop_click_target', input: { candidateId: 't_0' } },
    }))
    expect(stateManager.getState().lastClickedCandidateId).toBe('t_0')
    expect(stateManager.getState().lastPointerIntent).toMatchObject({
      candidateId: 't_0',
      phase: 'completed',
      executionResult: 'success',
    })
    expect(result.content.find(item => item.type === 'text')?.text).toContain('Clicked: ax AXButton "Submit"')
  })

  it('queues desktop_click_target without refocusing when approval is required', async () => {
    const { runtime, executor, session, desktopSessionController } = createRuntimeForActionTest({ approvalMode: 'all' })
    desktopSessionController.getSession.mockReturnValue({
      id: 'ds_1',
      controlledApp: 'Google Chrome',
      ownedWindows: [],
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    })
    executor.getForegroundContext.mockResolvedValue({
      available: true,
      appName: 'AIRI',
      platform: 'darwin',
    })
    session.createPendingAction.mockReturnValue({
      id: 'pa_1',
      createdAt: new Date().toISOString(),
      toolName: 'desktop_click_target',
      action: { kind: 'desktop_click_target', input: { candidateId: 't_0' } },
      context: {
        available: true,
        appName: 'Google Chrome',
        platform: 'darwin',
      },
      policy: {
        allowed: true,
        requiresApproval: true,
        reasons: [],
        riskLevel: 'medium',
        estimatedOperationUnits: 1,
      },
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'desktop_click_target', input: { candidateId: 't_0' } }, 'desktop_click_target')

    expect(result.structuredContent).toMatchObject({
      status: 'approval_required',
      pendingActionId: 'pa_1',
      action: {
        kind: 'desktop_click_target',
        input: { candidateId: 't_0' },
      },
    })
    expect(session.createPendingAction).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'desktop_click_target',
      action: { kind: 'desktop_click_target', input: { candidateId: 't_0' } },
      context: expect.objectContaining({ appName: 'Google Chrome' }),
    }))
    expect(desktopSessionController.ensureControlledAppInForeground).not.toHaveBeenCalled()
    expect(executor.click).not.toHaveBeenCalled()
    expect(session.consumeOperation).not.toHaveBeenCalled()
  })

  it('uses controlled-app context for desktop_click_target policy and refocuses only during execution', async () => {
    const { runtime, executor, session, stateManager, desktopSessionController } = createRuntimeForActionTest()
    stateManager.updateGroundingSnapshot({
      snapshotId: 'dg_1',
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      windows: [],
      screenshot: {
        dataBase64: '',
        mimeType: 'image/png',
        path: '',
        capturedAt: new Date().toISOString(),
      },
      targetCandidates: [
        {
          id: 't_0',
          source: 'ax',
          appName: 'Google Chrome',
          role: 'AXButton',
          label: 'Submit',
          bounds: { x: 100, y: 200, width: 80, height: 30 },
          confidence: 0.95,
          interactable: true,
        },
      ],
      staleFlags: { screenshot: false, ax: false, chromeSemantic: false },
    } as any)
    desktopSessionController.getSession.mockReturnValue({
      id: 'ds_1',
      controlledApp: 'Google Chrome',
      ownedWindows: [],
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    })
    desktopSessionController.ensureControlledAppInForeground.mockResolvedValue(true)
    executor.getForegroundContext.mockResolvedValue({
      available: true,
      appName: 'AIRI',
      platform: 'darwin',
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'desktop_click_target', input: { candidateId: 't_0' } }, 'desktop_click_target')

    expect(result.isError).not.toBe(true)
    expect(desktopSessionController.ensureControlledAppInForeground).toHaveBeenCalledWith(expect.objectContaining({
      currentForeground: expect.objectContaining({ appName: 'AIRI' }),
    }))
    expect(executor.click).toHaveBeenCalledOnce()
    expect(session.record).toHaveBeenCalledWith(expect.objectContaining({
      event: 'executed',
      context: expect.objectContaining({ appName: 'Google Chrome' }),
      policy: expect.objectContaining({ allowed: true }),
    }))
    expect(session.record).toHaveBeenCalledWith(expect.objectContaining({
      event: 'requested',
      result: expect.objectContaining({
        actualForegroundContext: expect.objectContaining({ appName: 'AIRI' }),
      }),
    }))
  })

  it('does not refocus when desktop_click_target stays on browser_dom', async () => {
    const { runtime, executor, stateManager, desktopSessionController } = createRuntimeForActionTest()
    stateManager.updateGroundingSnapshot({
      snapshotId: 'dg_1',
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      windows: [],
      screenshot: {
        dataBase64: '',
        mimeType: 'image/png',
        path: '',
        capturedAt: new Date().toISOString(),
      },
      targetCandidates: [
        {
          id: 't_0',
          source: 'chrome_dom',
          appName: 'Google Chrome',
          role: 'button',
          label: 'Submit',
          bounds: { x: 100, y: 200, width: 80, height: 30 },
          confidence: 0.95,
          interactable: true,
          selector: '#submit',
          frameId: 0,
          isPageContent: true,
        },
      ],
      staleFlags: { screenshot: false, ax: false, chromeSemantic: false },
    } as any)
    desktopSessionController.getSession.mockReturnValue({
      id: 'ds_1',
      controlledApp: 'Google Chrome',
      ownedWindows: [],
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    })
    executor.getForegroundContext.mockResolvedValue({
      available: true,
      appName: 'AIRI',
      platform: 'darwin',
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'desktop_click_target', input: { candidateId: 't_0' } }, 'desktop_click_target')

    expect(result.isError).not.toBe(true)
    expect(desktopSessionController.ensureControlledAppInForeground).not.toHaveBeenCalled()
    expect(executor.focusApp).not.toHaveBeenCalled()
    expect(executor.click).not.toHaveBeenCalled()
    expect(result.structuredContent).toMatchObject({
      status: 'executed',
      backendResult: expect.objectContaining({
        executionMode: 'browser_surface',
      }),
    })
  })

  it('refocuses when desktop_click_target falls back to OS input', async () => {
    const { runtime, executor, stateManager, desktopSessionController } = createRuntimeForActionTest()
    stateManager.updateGroundingSnapshot({
      snapshotId: 'dg_1',
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      windows: [],
      screenshot: {
        dataBase64: '',
        mimeType: 'image/png',
        path: '',
        capturedAt: new Date().toISOString(),
      },
      targetCandidates: [
        {
          id: 't_0',
          source: 'ax',
          appName: 'Google Chrome',
          role: 'AXButton',
          label: 'Submit',
          bounds: { x: 100, y: 200, width: 80, height: 30 },
          confidence: 0.95,
          interactable: true,
        },
      ],
      staleFlags: { screenshot: false, ax: false, chromeSemantic: false },
    } as any)
    desktopSessionController.getSession.mockReturnValue({
      id: 'ds_1',
      controlledApp: 'Google Chrome',
      ownedWindows: [],
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    })
    desktopSessionController.ensureControlledAppInForeground.mockResolvedValue(true)
    executor.getForegroundContext.mockResolvedValue({
      available: true,
      appName: 'AIRI',
      platform: 'darwin',
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'desktop_click_target', input: { candidateId: 't_0' } }, 'desktop_click_target')

    expect(result.isError).not.toBe(true)
    expect(desktopSessionController.ensureControlledAppInForeground).toHaveBeenCalled()
    expect(executor.click).toHaveBeenCalledOnce()
  })

  it('focuses the candidate app before OS fallback when no controlled session exists', async () => {
    const { runtime, executor, stateManager, desktopSessionController } = createRuntimeForActionTest()
    stateManager.updateGroundingSnapshot({
      snapshotId: 'dg_1',
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      windows: [],
      screenshot: {
        dataBase64: '',
        mimeType: 'image/png',
        path: '',
        capturedAt: new Date().toISOString(),
      },
      targetCandidates: [
        {
          id: 't_0',
          source: 'chrome_dom',
          appName: 'Google Chrome',
          role: 'button',
          label: 'Submit',
          bounds: { x: 100, y: 200, width: 80, height: 30 },
          confidence: 0.95,
          interactable: true,
          selector: '#submit',
          frameId: 0,
          isPageContent: true,
        },
      ],
      staleFlags: { screenshot: false, ax: false, chromeSemantic: false },
    } as any)
    desktopSessionController.getSession.mockReturnValue(null)
    executor.getForegroundContext.mockResolvedValue({
      available: true,
      appName: 'Finder',
      platform: 'darwin',
    })
    ;(runtime.browserDomBridge.supportsAction as any).mockReturnValue(false)

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'desktop_click_target', input: { candidateId: 't_0' } }, 'desktop_click_target')

    expect(result.isError).not.toBe(true)
    expect(desktopSessionController.ensureControlledAppInForeground).not.toHaveBeenCalled()
    expect(executor.focusApp).toHaveBeenCalledWith({ app: 'Google Chrome' })
    expect(executor.click).toHaveBeenCalledOnce()
    expect(result.structuredContent).toMatchObject({
      status: 'executed',
      backendResult: expect.objectContaining({
        executionRoute: 'os_input',
        executionMode: 'foreground',
        routeNote: expect.stringContaining('focused Google Chrome before OS input fallback'),
      }),
    })
  })

  it('rejects cross-app desktop_click_target fallback under a controlled session', async () => {
    const { runtime, executor, stateManager, desktopSessionController } = createRuntimeForActionTest()
    stateManager.updateGroundingSnapshot({
      snapshotId: 'dg_1',
      capturedAt: new Date().toISOString(),
      foregroundApp: 'AIRI',
      windows: [],
      screenshot: {
        dataBase64: '',
        mimeType: 'image/png',
        path: '',
        capturedAt: new Date().toISOString(),
      },
      targetCandidates: [
        {
          id: 't_0',
          source: 'ax',
          appName: 'AIRI',
          role: 'AXButton',
          label: 'Submit',
          bounds: { x: 100, y: 200, width: 80, height: 30 },
          confidence: 0.95,
          interactable: true,
        },
      ],
      staleFlags: { screenshot: false, ax: false, chromeSemantic: false },
    } as any)
    desktopSessionController.getSession.mockReturnValue({
      id: 'ds_1',
      controlledApp: 'Google Chrome',
      ownedWindows: [],
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    })
    executor.getForegroundContext.mockResolvedValue({
      available: true,
      appName: 'AIRI',
      platform: 'darwin',
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'desktop_click_target', input: { candidateId: 't_0' } }, 'desktop_click_target')

    expect(result.isError).toBe(true)
    expect(result.content.find(item => item.type === 'text')?.text).toContain('cross-app fallback')
    expect(desktopSessionController.ensureControlledAppInForeground).not.toHaveBeenCalled()
    expect(executor.focusApp).not.toHaveBeenCalled()
    expect(executor.click).not.toHaveBeenCalled()
  })

  it('returns a structured failure when controlled-app refocus fails during desktop_click_target execution', async () => {
    const { runtime, executor, session, stateManager, desktopSessionController } = createRuntimeForActionTest()
    stateManager.updateGroundingSnapshot({
      snapshotId: 'dg_1',
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      windows: [],
      screenshot: {
        dataBase64: '',
        mimeType: 'image/png',
        path: '',
        capturedAt: new Date().toISOString(),
      },
      targetCandidates: [
        {
          id: 't_0',
          source: 'ax',
          appName: 'Google Chrome',
          role: 'AXButton',
          label: 'Submit',
          bounds: { x: 100, y: 200, width: 80, height: 30 },
          confidence: 0.95,
          interactable: true,
        },
      ],
      staleFlags: { screenshot: false, ax: false, chromeSemantic: false },
    } as any)
    desktopSessionController.getSession.mockReturnValue({
      id: 'ds_1',
      controlledApp: 'Google Chrome',
      ownedWindows: [],
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    })
    desktopSessionController.ensureControlledAppInForeground.mockRejectedValue(new Error('Chrome session unavailable'))
    executor.getForegroundContext.mockResolvedValue({
      available: true,
      appName: 'AIRI',
      platform: 'darwin',
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'desktop_click_target', input: { candidateId: 't_0' } }, 'desktop_click_target')

    expect(result.isError).toBe(true)
    expect(result.content.find(item => item.type === 'text')?.text).toContain('Chrome session unavailable')
    expect(executor.click).not.toHaveBeenCalled()
    expect(session.consumeOperation).not.toHaveBeenCalled()
    expect(session.record).toHaveBeenCalledWith(expect.objectContaining({
      event: 'failed',
      toolName: 'desktop_click_target',
      context: expect.objectContaining({ appName: 'Google Chrome' }),
      result: expect.objectContaining({ error: 'Chrome session unavailable' }),
    }))
  })

  it('fails desktop_click_target before consuming budget when no observe snapshot exists', async () => {
    const { runtime, executor, session } = createRuntimeForActionTest()

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'desktop_click_target', input: { candidateId: 't_missing' } }, 'desktop_click_target')

    expect(result.isError).toBe(true)
    expect(result.content.find(item => item.type === 'text')?.text).toContain('No desktop_observe snapshot available')
    expect(executor.click).not.toHaveBeenCalled()
    expect(session.consumeOperation).not.toHaveBeenCalled()
    expect(session.record).toHaveBeenCalledWith(expect.objectContaining({
      event: 'failed',
      toolName: 'desktop_click_target',
      action: { kind: 'desktop_click_target', input: { candidateId: 't_missing' } },
    }))
  })

  it('refreshes browser surface availability for direct actions before evaluating strategy', async () => {
    const { runtime, cdpBridgeManager } = createRuntimeForActionTest()

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'click', input: { x: 10, y: 20, captureAfter: false } }, 'desktop_click')

    const summaryText = result.content.find(item => item.type === 'text')?.text ?? ''
    expect(summaryText).toContain('browser_dom')
    expect(runtime.stateManager.getState().browserSurfaceAvailability).toMatchObject({
      preferredSurface: 'browser_dom',
      selectedToolName: 'browser_dom_read_page',
    })
    expect(cdpBridgeManager.probeAvailability).toHaveBeenCalledTimes(1)

    const structured = result.structuredContent as Record<string, any>
    expect(structured.transparency.advisories).toContainEqual(expect.objectContaining({
      kind: 'use_browser_surface',
      reason: expect.stringContaining('extension DOM stack is preferred'),
    }))
  })

  it('does not reuse stale browser-dom typing route when explicit coordinates are provided', async () => {
    const stateManager = new RunStateManager()
    stateManager.updateGroundingSnapshot({
      snapshotId: 'dg_1',
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      windows: [],
      screenshot: { dataBase64: '', mimeType: 'image/png', path: '', capturedAt: new Date().toISOString() },
      targetCandidates: [
        {
          id: 't_0',
          source: 'chrome_dom',
          appName: 'Google Chrome',
          role: 'textbox',
          label: 'Email',
          bounds: { x: 100, y: 200, width: 140, height: 28 },
          confidence: 0.98,
          interactable: true,
          tag: 'input',
          inputType: 'text',
          selector: '#email',
          frameId: 0,
          isPageContent: true,
        },
      ],
      staleFlags: { screenshot: false, ax: false, chromeSemantic: false },
    } as any)
    stateManager.updatePointerIntent({
      mode: 'execute',
      candidateId: 't_0',
      rawPoint: { x: 120, y: 214 },
      snappedPoint: { x: 120, y: 214 },
      source: 'chrome_dom',
      confidence: 0.98,
      path: [{ x: 120, y: 214, delayMs: 0 }],
      phase: 'completed',
      executionResult: 'success',
    }, 't_0')

    const session = {
      listPendingActions: vi.fn().mockReturnValue([]),
      getBudgetState: vi.fn().mockReturnValue({
        operationsExecuted: 0,
        operationUnitsConsumed: 0,
      }),
      record: vi.fn().mockResolvedValue(undefined),
      createPendingAction: vi.fn(),
      consumeOperation: vi.fn(),
      getLastScreenshot: vi.fn().mockReturnValue(undefined),
      setLastScreenshot: vi.fn(),
      getTerminalState: vi.fn().mockReturnValue(createTerminalState()),
      setTerminalState: vi.fn(),
      getPointerPosition: vi.fn().mockReturnValue({ x: 0, y: 0 }),
      setPointerPosition: vi.fn(),
    }
    const executor = {
      kind: 'dry-run' as const,
      describe: () => ({ kind: 'dry-run' as const, notes: [] }),
      getExecutionTarget: vi.fn().mockResolvedValue(createLocalExecutionTarget()),
      getForegroundContext: vi.fn().mockResolvedValue({
        available: true,
        appName: 'Google Chrome',
        platform: 'darwin',
      }),
      getDisplayInfo: vi.fn().mockResolvedValue(createDisplayInfo({
        platform: 'darwin',
      })),
      getPermissionInfo: vi.fn(),
      observeWindows: vi.fn(),
      takeScreenshot: vi.fn(),
      openApp: vi.fn(),
      focusApp: vi.fn(),
      click: vi.fn().mockResolvedValue({
        performed: true,
        backend: 'dry-run' as const,
        notes: [],
      }),
      typeText: vi.fn().mockResolvedValue({
        performed: true,
        backend: 'dry-run' as const,
        notes: [],
      }),
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
      setInputValue: vi.fn().mockResolvedValue(undefined),
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
      }),
      session,
      executor,
      terminalRunner,
      browserDomBridge,
      cdpBridgeManager,
      stateManager,
      taskMemory: {},
    } as unknown as ComputerUseServerRuntime

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({
      kind: 'type_text',
      input: {
        x: 300,
        y: 400,
        text: 'hello',
        captureAfter: false,
      },
    }, 'desktop_type_text')

    expect(result.isError).not.toBe(true)
    expect(executor.click).toHaveBeenCalledOnce()
    expect(executor.typeText).toHaveBeenCalledOnce()
    expect(browserDomBridge.setInputValue).not.toHaveBeenCalled()
  })

  it('falls back to OS typing when the connected extension transport does not support setInputValue', async () => {
    const stateManager = new RunStateManager()
    stateManager.updateGroundingSnapshot({
      snapshotId: 'dg_1',
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      windows: [],
      screenshot: { dataBase64: '', mimeType: 'image/png', path: '', capturedAt: new Date().toISOString() },
      targetCandidates: [
        {
          id: 't_0',
          source: 'chrome_dom',
          appName: 'Google Chrome',
          role: 'textbox',
          label: 'Email',
          bounds: { x: 100, y: 200, width: 140, height: 28 },
          confidence: 0.98,
          interactable: true,
          tag: 'input',
          inputType: 'text',
          selector: '#email',
          frameId: 0,
          isPageContent: true,
        },
      ],
      staleFlags: { screenshot: false, ax: false, chromeSemantic: false },
    } as any)
    stateManager.updatePointerIntent({
      mode: 'execute',
      candidateId: 't_0',
      rawPoint: { x: 120, y: 214 },
      snappedPoint: { x: 120, y: 214 },
      source: 'chrome_dom',
      confidence: 0.98,
      path: [{ x: 120, y: 214, delayMs: 0 }],
      phase: 'completed',
      executionResult: 'success',
    }, 't_0')

    const session = {
      listPendingActions: vi.fn().mockReturnValue([]),
      getBudgetState: vi.fn().mockReturnValue({
        operationsExecuted: 0,
        operationUnitsConsumed: 0,
      }),
      record: vi.fn().mockResolvedValue(undefined),
      createPendingAction: vi.fn(),
      consumeOperation: vi.fn(),
      getLastScreenshot: vi.fn().mockReturnValue(undefined),
      setLastScreenshot: vi.fn(),
      getTerminalState: vi.fn().mockReturnValue(createTerminalState()),
      setTerminalState: vi.fn(),
      getPointerPosition: vi.fn().mockReturnValue({ x: 0, y: 0 }),
      setPointerPosition: vi.fn(),
    }
    const executor = {
      kind: 'dry-run' as const,
      describe: () => ({ kind: 'dry-run' as const, notes: [] }),
      getExecutionTarget: vi.fn().mockResolvedValue(createLocalExecutionTarget()),
      getForegroundContext: vi.fn().mockResolvedValue({
        available: true,
        appName: 'Google Chrome',
        platform: 'darwin',
      }),
      getDisplayInfo: vi.fn().mockResolvedValue(createDisplayInfo({
        platform: 'darwin',
      })),
      getPermissionInfo: vi.fn(),
      observeWindows: vi.fn(),
      takeScreenshot: vi.fn(),
      openApp: vi.fn(),
      focusApp: vi.fn(),
      click: vi.fn(),
      typeText: vi.fn().mockResolvedValue({
        performed: true,
        backend: 'dry-run' as const,
        notes: [],
      }),
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
      supportsAction: vi.fn().mockImplementation((action: string) => action !== 'setInputValue'),
      setInputValue: vi.fn().mockResolvedValue(undefined),
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
      }),
      session,
      executor,
      terminalRunner,
      browserDomBridge,
      cdpBridgeManager,
      stateManager,
      taskMemory: {},
    } as unknown as ComputerUseServerRuntime

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({
      kind: 'type_text',
      input: {
        text: 'hello',
        captureAfter: false,
      },
    }, 'desktop_type_text')

    expect(result.isError).not.toBe(true)
    expect(executor.typeText).toHaveBeenCalledOnce()
    expect(browserDomBridge.setInputValue).not.toHaveBeenCalled()
  })

  it('records main-display metadata while preserving original global logical click coordinates', async () => {
    const { runtime, executor } = createRuntimeForActionTest(createCombinedDisplayBoundsConfig())
    executor.getDisplayInfo.mockResolvedValue(createMultiDisplayInfo())

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'click', input: { x: 100, y: 50, button: 'left', captureAfter: false } }, 'desktop_click')

    expect(result.isError).not.toBe(true)
    expect(executor.click).toHaveBeenCalledWith(expect.objectContaining({
      x: 100,
      y: 50,
      pointerTrace: expect.arrayContaining([
        expect.objectContaining({ x: 100, y: 50 }),
      ]),
    }))

    const structured = result.structuredContent as Record<string, any>
    expect(structured.backendResult.displayPoint).toMatchObject({
      coordinateSpace: 'global-logical',
      global: { x: 100, y: 50 },
      displayId: 1,
      local: { x: 100, y: 50 },
      backingPixel: { x: 200, y: 100 },
      scaleFactor: 2,
    })
  })

  it('accepts negative-coordinate external display clicks and records display-local metadata', async () => {
    const { runtime, executor } = createRuntimeForActionTest(createCombinedDisplayBoundsConfig())
    executor.getDisplayInfo.mockResolvedValue(createMultiDisplayInfo())

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'click', input: { x: -100, y: -500, captureAfter: false } }, 'desktop_click')

    expect(result.isError).not.toBe(true)
    expect(executor.click).toHaveBeenCalledWith(expect.objectContaining({
      x: -100,
      y: -500,
      pointerTrace: expect.arrayContaining([
        expect.objectContaining({ x: -100, y: -500 }),
      ]),
    }))

    const structured = result.structuredContent as Record<string, any>
    expect(structured.backendResult.displayPoint).toMatchObject({
      coordinateSpace: 'global-logical',
      global: { x: -100, y: -500 },
      displayId: 3,
      local: { x: 122, y: 580 },
      backingPixel: { x: 122, y: 580 },
      scaleFactor: 1,
    })
  })

  it('rejects physical-pixel-looking Retina coordinates outside the global logical display contract', async () => {
    const { runtime, executor } = createRuntimeForActionTest({
      allowedBounds: { x: -10_000, y: -10_000, width: 20_000, height: 20_000 },
    })
    executor.getDisplayInfo.mockResolvedValue(createMultiDisplayInfo())

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'click', input: { x: 2000, y: 500, captureAfter: false } }, 'desktop_click')

    expect(result.isError).toBe(true)
    expect(executor.click).not.toHaveBeenCalled()
    expect((result.content[0] as { text: string }).text).toContain('outside connected display bounds')
  })

  it('uses the same display resolver for type_text preparatory clicks', async () => {
    const { runtime, executor } = createRuntimeForActionTest(createCombinedDisplayBoundsConfig())
    executor.getDisplayInfo.mockResolvedValue(createMultiDisplayInfo())
    executor.typeText.mockResolvedValue({
      performed: true,
      backend: 'dry-run' as const,
      notes: [],
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ kind: 'type_text', input: { text: 'hello', x: -100, y: -500, captureAfter: false } }, 'desktop_type_text')

    expect(result.isError).not.toBe(true)
    expect(executor.click).toHaveBeenCalledWith(expect.objectContaining({
      x: -100,
      y: -500,
    }))
    expect(executor.typeText).toHaveBeenCalledTimes(1)

    const structured = result.structuredContent as Record<string, any>
    expect(structured.backendResult.focusDisplayPoint).toMatchObject({
      displayId: 3,
      local: { x: 122, y: 580 },
      backingPixel: { x: 122, y: 580 },
    })
  })
})
