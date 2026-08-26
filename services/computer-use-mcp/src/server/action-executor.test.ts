import type { ComputerUseConfig } from '../types'
import type { ComputerUseServerRuntime } from './runtime'

import { describe, expect, it, vi } from 'vitest'

import { RunStateManager } from '../state'
import { createDisplayInfo, createLocalExecutionTarget, createTerminalState, createTestConfig } from '../test-fixtures'
import { createExecuteAction } from './action-executor'

function createCombinedDisplayBoundsConfig() {
  return {
    allowedBounds: { height: 2062, width: 1920, x: -222, y: -1080 },
  }
}

function createMultiDisplayInfo() {
  return createDisplayInfo({
    capturedAt: '2026-04-27T00:00:00.000Z',
    combinedBounds: { height: 2062, width: 1920, x: -222, y: -1080 },
    displayCount: 2,
    displays: [
      {
        bounds: { height: 982, width: 1512, x: 0, y: 0 },
        displayId: 1,
        isBuiltIn: true,
        isMain: true,
        pixelHeight: 1964,
        pixelWidth: 3024,
        scaleFactor: 2,
        visibleBounds: { height: 884, width: 1512, x: 0, y: 65 },
      },
      {
        bounds: { height: 1080, width: 1920, x: -222, y: -1080 },
        displayId: 3,
        isBuiltIn: false,
        isMain: false,
        pixelHeight: 1080,
        pixelWidth: 1920,
        scaleFactor: 1,
        visibleBounds: { height: 1080, width: 1920, x: -222, y: -1080 },
      },
    ],
    isRetina: true,
    logicalHeight: 982,
    logicalWidth: 1512,
    pixelHeight: 1964,
    pixelWidth: 3024,
    platform: 'darwin',
    scaleFactor: 2,
  })
}

function createRuntimeForActionTest(configOverrides: Partial<ComputerUseConfig> = {}) {
  const stateManager = new RunStateManager()
  const session = {
    consumeOperation: vi.fn(),
    createPendingAction: vi.fn(),
    getBudgetState: vi.fn().mockReturnValue({
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    }),
    getLastScreenshot: vi.fn().mockReturnValue(undefined),
    getPointerPosition: vi.fn().mockReturnValue(undefined),
    getTerminalState: vi.fn().mockReturnValue(createTerminalState()),
    listPendingActions: vi.fn().mockReturnValue([]),
    record: vi.fn().mockResolvedValue(undefined),
    setLastScreenshot: vi.fn(),
    setPointerPosition: vi.fn(),
    setTerminalState: vi.fn(),
  }
  const executor = {
    click: vi.fn().mockResolvedValue({
      backend: 'dry-run' as const,
      notes: [],
      performed: true,
    }),
    describe: () => ({ kind: 'dry-run' as const, notes: [] }),
    focusApp: vi.fn(),
    getDisplayInfo: vi.fn().mockResolvedValue(createDisplayInfo({
      platform: 'darwin',
    })),
    getExecutionTarget: vi.fn().mockResolvedValue(createLocalExecutionTarget()),
    getForegroundContext: vi.fn().mockResolvedValue({
      appName: 'Google Chrome',
      available: true,
      platform: 'darwin',
    }),
    getPermissionInfo: vi.fn(),
    kind: 'dry-run' as const,
    observeWindows: vi.fn(),
    openApp: vi.fn(),
    pressKeys: vi.fn(),
    scroll: vi.fn(),
    takeScreenshot: vi.fn(),
    typeText: vi.fn(),
    wait: vi.fn(),
  }
  const desktopSessionController = {
    ensureControlledAppInForeground: vi.fn(),
    getSession: vi.fn().mockReturnValue(null),
    touch: vi.fn(),
  }
  const terminalRunner = {
    describe: () => ({ kind: 'local-shell-runner' as const, notes: [] }),
    execute: vi.fn(),
    getState: vi.fn().mockReturnValue(createTerminalState()),
    resetState: vi.fn(),
  }
  const browserDomBridge = {
    checkCheckbox: vi.fn().mockResolvedValue(undefined),
    clickSelector: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue({
      connected: true,
      enabled: true,
      host: '127.0.0.1',
      pendingRequests: 0,
      port: 8765,
    }),
    supportsAction: vi.fn().mockReturnValue(true),
  }
  const cdpBridgeManager = {
    probeAvailability: vi.fn().mockResolvedValue({
      connectable: true,
      connected: false,
      endpoint: 'http://localhost:9222',
    }),
  }

  const runtime = {
    browserDomBridge,
    cdpBridgeManager,
    chromeSessionManager: {},
    config: createTestConfig({
      approvalMode: 'never',
      defaultCaptureAfter: false,
      executor: 'dry-run',
      ...configOverrides,
    }),
    desktopSessionController,
    executor,
    session,
    stateManager,
    taskMemory: {},
    terminalRunner,
  } as unknown as ComputerUseServerRuntime

  return {
    cdpBridgeManager,
    desktopSessionController,
    executor,
    runtime,
    session,
    stateManager,
  }
}

describe('createExecuteAction', () => {
  it('executes desktop_click_target through the shared policy and audit pipeline', async () => {
    const { executor, runtime, session, stateManager } = createRuntimeForActionTest()
    stateManager.updateGroundingSnapshot({
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      screenshot: {
        capturedAt: new Date().toISOString(),
        dataBase64: '',
        mimeType: 'image/png',
        path: '',
      },
      snapshotId: 'dg_1',
      staleFlags: { ax: false, chromeSemantic: false, screenshot: false },
      targetCandidates: [
        {
          appName: 'Google Chrome',
          bounds: { height: 30, width: 80, x: 100, y: 200 },
          confidence: 0.95,
          id: 't_0',
          interactable: true,
          label: 'Submit',
          role: 'AXButton',
          source: 'ax',
        },
      ],
      windows: [],
    } as any)

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ input: { candidateId: 't_0' }, kind: 'desktop_click_target' }, 'desktop_click_target')

    expect(result.isError).not.toBe(true)
    expect(executor.click).toHaveBeenCalledWith(expect.objectContaining({
      button: 'left',
      clickCount: 1,
      pointerTrace: [{ delayMs: 0, x: 140, y: 215 }],
      x: 140,
      y: 215,
    }))
    expect(session.consumeOperation).toHaveBeenCalledWith(1)
    expect(session.setPointerPosition).toHaveBeenCalledWith({ x: 140, y: 215 })
    expect(session.record).toHaveBeenCalledWith(expect.objectContaining({
      action: { input: { candidateId: 't_0' }, kind: 'desktop_click_target' },
      event: 'executed',
      toolName: 'desktop_click_target',
    }))
    expect(stateManager.getState().lastClickedCandidateId).toBe('t_0')
    expect(stateManager.getState().lastPointerIntent).toMatchObject({
      candidateId: 't_0',
      executionResult: 'success',
      phase: 'completed',
    })
    expect(result.content.find(item => item.type === 'text')?.text).toContain('Clicked: ax AXButton "Submit"')
  })

  it('queues desktop_click_target without refocusing when approval is required', async () => {
    const { desktopSessionController, executor, runtime, session } = createRuntimeForActionTest({ approvalMode: 'all' })
    desktopSessionController.getSession.mockReturnValue({
      controlledApp: 'Google Chrome',
      createdAt: new Date().toISOString(),
      id: 'ds_1',
      lastActiveAt: new Date().toISOString(),
      ownedWindows: [],
    })
    executor.getForegroundContext.mockResolvedValue({
      appName: 'AIRI',
      available: true,
      platform: 'darwin',
    })
    session.createPendingAction.mockReturnValue({
      action: { input: { candidateId: 't_0' }, kind: 'desktop_click_target' },
      context: {
        appName: 'Google Chrome',
        available: true,
        platform: 'darwin',
      },
      createdAt: new Date().toISOString(),
      id: 'pa_1',
      policy: {
        allowed: true,
        estimatedOperationUnits: 1,
        reasons: [],
        requiresApproval: true,
        riskLevel: 'medium',
      },
      toolName: 'desktop_click_target',
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ input: { candidateId: 't_0' }, kind: 'desktop_click_target' }, 'desktop_click_target')

    expect(result.structuredContent).toMatchObject({
      action: {
        input: { candidateId: 't_0' },
        kind: 'desktop_click_target',
      },
      pendingActionId: 'pa_1',
      status: 'approval_required',
    })
    expect(session.createPendingAction).toHaveBeenCalledWith(expect.objectContaining({
      action: { input: { candidateId: 't_0' }, kind: 'desktop_click_target' },
      context: expect.objectContaining({ appName: 'Google Chrome' }),
      toolName: 'desktop_click_target',
    }))
    expect(desktopSessionController.ensureControlledAppInForeground).not.toHaveBeenCalled()
    expect(executor.click).not.toHaveBeenCalled()
    expect(session.consumeOperation).not.toHaveBeenCalled()
  })

  it('uses controlled-app context for desktop_click_target policy and refocuses only during execution', async () => {
    const { desktopSessionController, executor, runtime, session, stateManager } = createRuntimeForActionTest()
    stateManager.updateGroundingSnapshot({
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      screenshot: {
        capturedAt: new Date().toISOString(),
        dataBase64: '',
        mimeType: 'image/png',
        path: '',
      },
      snapshotId: 'dg_1',
      staleFlags: { ax: false, chromeSemantic: false, screenshot: false },
      targetCandidates: [
        {
          appName: 'Google Chrome',
          bounds: { height: 30, width: 80, x: 100, y: 200 },
          confidence: 0.95,
          id: 't_0',
          interactable: true,
          label: 'Submit',
          role: 'AXButton',
          source: 'ax',
        },
      ],
      windows: [],
    } as any)
    desktopSessionController.getSession.mockReturnValue({
      controlledApp: 'Google Chrome',
      createdAt: new Date().toISOString(),
      id: 'ds_1',
      lastActiveAt: new Date().toISOString(),
      ownedWindows: [],
    })
    desktopSessionController.ensureControlledAppInForeground.mockResolvedValue(true)
    executor.getForegroundContext.mockResolvedValue({
      appName: 'AIRI',
      available: true,
      platform: 'darwin',
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ input: { candidateId: 't_0' }, kind: 'desktop_click_target' }, 'desktop_click_target')

    expect(result.isError).not.toBe(true)
    expect(desktopSessionController.ensureControlledAppInForeground).toHaveBeenCalledWith(expect.objectContaining({
      currentForeground: expect.objectContaining({ appName: 'AIRI' }),
    }))
    expect(executor.click).toHaveBeenCalledOnce()
    expect(session.record).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ appName: 'Google Chrome' }),
      event: 'executed',
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
    const { desktopSessionController, executor, runtime, stateManager } = createRuntimeForActionTest()
    stateManager.updateGroundingSnapshot({
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      screenshot: {
        capturedAt: new Date().toISOString(),
        dataBase64: '',
        mimeType: 'image/png',
        path: '',
      },
      snapshotId: 'dg_1',
      staleFlags: { ax: false, chromeSemantic: false, screenshot: false },
      targetCandidates: [
        {
          appName: 'Google Chrome',
          bounds: { height: 30, width: 80, x: 100, y: 200 },
          confidence: 0.95,
          frameId: 0,
          id: 't_0',
          interactable: true,
          isPageContent: true,
          label: 'Submit',
          role: 'button',
          selector: '#submit',
          source: 'chrome_dom',
        },
      ],
      windows: [],
    } as any)
    desktopSessionController.getSession.mockReturnValue({
      controlledApp: 'Google Chrome',
      createdAt: new Date().toISOString(),
      id: 'ds_1',
      lastActiveAt: new Date().toISOString(),
      ownedWindows: [],
    })
    executor.getForegroundContext.mockResolvedValue({
      appName: 'AIRI',
      available: true,
      platform: 'darwin',
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ input: { candidateId: 't_0' }, kind: 'desktop_click_target' }, 'desktop_click_target')

    expect(result.isError).not.toBe(true)
    expect(desktopSessionController.ensureControlledAppInForeground).not.toHaveBeenCalled()
    expect(executor.focusApp).not.toHaveBeenCalled()
    expect(executor.click).not.toHaveBeenCalled()
    expect(result.structuredContent).toMatchObject({
      backendResult: expect.objectContaining({
        executionMode: 'browser_surface',
      }),
      status: 'executed',
    })
  })

  it('refocuses when desktop_click_target falls back to OS input', async () => {
    const { desktopSessionController, executor, runtime, stateManager } = createRuntimeForActionTest()
    stateManager.updateGroundingSnapshot({
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      screenshot: {
        capturedAt: new Date().toISOString(),
        dataBase64: '',
        mimeType: 'image/png',
        path: '',
      },
      snapshotId: 'dg_1',
      staleFlags: { ax: false, chromeSemantic: false, screenshot: false },
      targetCandidates: [
        {
          appName: 'Google Chrome',
          bounds: { height: 30, width: 80, x: 100, y: 200 },
          confidence: 0.95,
          id: 't_0',
          interactable: true,
          label: 'Submit',
          role: 'AXButton',
          source: 'ax',
        },
      ],
      windows: [],
    } as any)
    desktopSessionController.getSession.mockReturnValue({
      controlledApp: 'Google Chrome',
      createdAt: new Date().toISOString(),
      id: 'ds_1',
      lastActiveAt: new Date().toISOString(),
      ownedWindows: [],
    })
    desktopSessionController.ensureControlledAppInForeground.mockResolvedValue(true)
    executor.getForegroundContext.mockResolvedValue({
      appName: 'AIRI',
      available: true,
      platform: 'darwin',
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ input: { candidateId: 't_0' }, kind: 'desktop_click_target' }, 'desktop_click_target')

    expect(result.isError).not.toBe(true)
    expect(desktopSessionController.ensureControlledAppInForeground).toHaveBeenCalled()
    expect(executor.click).toHaveBeenCalledOnce()
  })

  it('focuses the candidate app before OS fallback when no controlled session exists', async () => {
    const { desktopSessionController, executor, runtime, stateManager } = createRuntimeForActionTest()
    stateManager.updateGroundingSnapshot({
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      screenshot: {
        capturedAt: new Date().toISOString(),
        dataBase64: '',
        mimeType: 'image/png',
        path: '',
      },
      snapshotId: 'dg_1',
      staleFlags: { ax: false, chromeSemantic: false, screenshot: false },
      targetCandidates: [
        {
          appName: 'Google Chrome',
          bounds: { height: 30, width: 80, x: 100, y: 200 },
          confidence: 0.95,
          frameId: 0,
          id: 't_0',
          interactable: true,
          isPageContent: true,
          label: 'Submit',
          role: 'button',
          selector: '#submit',
          source: 'chrome_dom',
        },
      ],
      windows: [],
    } as any)
    desktopSessionController.getSession.mockReturnValue(null)
    executor.getForegroundContext.mockResolvedValue({
      appName: 'Finder',
      available: true,
      platform: 'darwin',
    })
    ;(runtime.browserDomBridge.supportsAction as any).mockReturnValue(false)

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ input: { candidateId: 't_0' }, kind: 'desktop_click_target' }, 'desktop_click_target')

    expect(result.isError).not.toBe(true)
    expect(desktopSessionController.ensureControlledAppInForeground).not.toHaveBeenCalled()
    expect(executor.focusApp).toHaveBeenCalledWith({ app: 'Google Chrome' })
    expect(executor.click).toHaveBeenCalledOnce()
    expect(result.structuredContent).toMatchObject({
      backendResult: expect.objectContaining({
        executionMode: 'foreground',
        executionRoute: 'os_input',
        routeNote: expect.stringContaining('focused Google Chrome before OS input fallback'),
      }),
      status: 'executed',
    })
  })

  it('rejects cross-app desktop_click_target fallback under a controlled session', async () => {
    const { desktopSessionController, executor, runtime, stateManager } = createRuntimeForActionTest()
    stateManager.updateGroundingSnapshot({
      capturedAt: new Date().toISOString(),
      foregroundApp: 'AIRI',
      screenshot: {
        capturedAt: new Date().toISOString(),
        dataBase64: '',
        mimeType: 'image/png',
        path: '',
      },
      snapshotId: 'dg_1',
      staleFlags: { ax: false, chromeSemantic: false, screenshot: false },
      targetCandidates: [
        {
          appName: 'AIRI',
          bounds: { height: 30, width: 80, x: 100, y: 200 },
          confidence: 0.95,
          id: 't_0',
          interactable: true,
          label: 'Submit',
          role: 'AXButton',
          source: 'ax',
        },
      ],
      windows: [],
    } as any)
    desktopSessionController.getSession.mockReturnValue({
      controlledApp: 'Google Chrome',
      createdAt: new Date().toISOString(),
      id: 'ds_1',
      lastActiveAt: new Date().toISOString(),
      ownedWindows: [],
    })
    executor.getForegroundContext.mockResolvedValue({
      appName: 'AIRI',
      available: true,
      platform: 'darwin',
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ input: { candidateId: 't_0' }, kind: 'desktop_click_target' }, 'desktop_click_target')

    expect(result.isError).toBe(true)
    expect(result.content.find(item => item.type === 'text')?.text).toContain('cross-app fallback')
    expect(desktopSessionController.ensureControlledAppInForeground).not.toHaveBeenCalled()
    expect(executor.focusApp).not.toHaveBeenCalled()
    expect(executor.click).not.toHaveBeenCalled()
  })

  it('returns a structured failure when controlled-app refocus fails during desktop_click_target execution', async () => {
    const { desktopSessionController, executor, runtime, session, stateManager } = createRuntimeForActionTest()
    stateManager.updateGroundingSnapshot({
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      screenshot: {
        capturedAt: new Date().toISOString(),
        dataBase64: '',
        mimeType: 'image/png',
        path: '',
      },
      snapshotId: 'dg_1',
      staleFlags: { ax: false, chromeSemantic: false, screenshot: false },
      targetCandidates: [
        {
          appName: 'Google Chrome',
          bounds: { height: 30, width: 80, x: 100, y: 200 },
          confidence: 0.95,
          id: 't_0',
          interactable: true,
          label: 'Submit',
          role: 'AXButton',
          source: 'ax',
        },
      ],
      windows: [],
    } as any)
    desktopSessionController.getSession.mockReturnValue({
      controlledApp: 'Google Chrome',
      createdAt: new Date().toISOString(),
      id: 'ds_1',
      lastActiveAt: new Date().toISOString(),
      ownedWindows: [],
    })
    desktopSessionController.ensureControlledAppInForeground.mockRejectedValue(new Error('Chrome session unavailable'))
    executor.getForegroundContext.mockResolvedValue({
      appName: 'AIRI',
      available: true,
      platform: 'darwin',
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ input: { candidateId: 't_0' }, kind: 'desktop_click_target' }, 'desktop_click_target')

    expect(result.isError).toBe(true)
    expect(result.content.find(item => item.type === 'text')?.text).toContain('Chrome session unavailable')
    expect(executor.click).not.toHaveBeenCalled()
    expect(session.consumeOperation).not.toHaveBeenCalled()
    expect(session.record).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ appName: 'Google Chrome' }),
      event: 'failed',
      result: expect.objectContaining({ error: 'Chrome session unavailable' }),
      toolName: 'desktop_click_target',
    }))
  })

  it('fails desktop_click_target before consuming budget when no observe snapshot exists', async () => {
    const { executor, runtime, session } = createRuntimeForActionTest()

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ input: { candidateId: 't_missing' }, kind: 'desktop_click_target' }, 'desktop_click_target')

    expect(result.isError).toBe(true)
    expect(result.content.find(item => item.type === 'text')?.text).toContain('No desktop_observe snapshot available')
    expect(executor.click).not.toHaveBeenCalled()
    expect(session.consumeOperation).not.toHaveBeenCalled()
    expect(session.record).toHaveBeenCalledWith(expect.objectContaining({
      action: { input: { candidateId: 't_missing' }, kind: 'desktop_click_target' },
      event: 'failed',
      toolName: 'desktop_click_target',
    }))
  })

  it('refreshes browser surface availability for direct actions before evaluating strategy', async () => {
    const { cdpBridgeManager, runtime } = createRuntimeForActionTest()

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ input: { captureAfter: false, x: 10, y: 20 }, kind: 'click' }, 'desktop_click')

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
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      screenshot: { capturedAt: new Date().toISOString(), dataBase64: '', mimeType: 'image/png', path: '' },
      snapshotId: 'dg_1',
      staleFlags: { ax: false, chromeSemantic: false, screenshot: false },
      targetCandidates: [
        {
          appName: 'Google Chrome',
          bounds: { height: 28, width: 140, x: 100, y: 200 },
          confidence: 0.98,
          frameId: 0,
          id: 't_0',
          inputType: 'text',
          interactable: true,
          isPageContent: true,
          label: 'Email',
          role: 'textbox',
          selector: '#email',
          source: 'chrome_dom',
          tag: 'input',
        },
      ],
      windows: [],
    } as any)
    stateManager.updatePointerIntent({
      candidateId: 't_0',
      confidence: 0.98,
      executionResult: 'success',
      mode: 'execute',
      path: [{ delayMs: 0, x: 120, y: 214 }],
      phase: 'completed',
      rawPoint: { x: 120, y: 214 },
      snappedPoint: { x: 120, y: 214 },
      source: 'chrome_dom',
    }, 't_0')

    const session = {
      consumeOperation: vi.fn(),
      createPendingAction: vi.fn(),
      getBudgetState: vi.fn().mockReturnValue({
        operationsExecuted: 0,
        operationUnitsConsumed: 0,
      }),
      getLastScreenshot: vi.fn().mockReturnValue(undefined),
      getPointerPosition: vi.fn().mockReturnValue({ x: 0, y: 0 }),
      getTerminalState: vi.fn().mockReturnValue(createTerminalState()),
      listPendingActions: vi.fn().mockReturnValue([]),
      record: vi.fn().mockResolvedValue(undefined),
      setLastScreenshot: vi.fn(),
      setPointerPosition: vi.fn(),
      setTerminalState: vi.fn(),
    }
    const executor = {
      click: vi.fn().mockResolvedValue({
        backend: 'dry-run' as const,
        notes: [],
        performed: true,
      }),
      describe: () => ({ kind: 'dry-run' as const, notes: [] }),
      focusApp: vi.fn(),
      getDisplayInfo: vi.fn().mockResolvedValue(createDisplayInfo({
        platform: 'darwin',
      })),
      getExecutionTarget: vi.fn().mockResolvedValue(createLocalExecutionTarget()),
      getForegroundContext: vi.fn().mockResolvedValue({
        appName: 'Google Chrome',
        available: true,
        platform: 'darwin',
      }),
      getPermissionInfo: vi.fn(),
      kind: 'dry-run' as const,
      observeWindows: vi.fn(),
      openApp: vi.fn(),
      pressKeys: vi.fn(),
      scroll: vi.fn(),
      takeScreenshot: vi.fn(),
      typeText: vi.fn().mockResolvedValue({
        backend: 'dry-run' as const,
        notes: [],
        performed: true,
      }),
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
        connected: true,
        enabled: true,
        host: '127.0.0.1',
        pendingRequests: 0,
        port: 8765,
      }),
      setInputValue: vi.fn().mockResolvedValue(undefined),
    }
    const cdpBridgeManager = {
      probeAvailability: vi.fn().mockResolvedValue({
        connectable: true,
        connected: false,
        endpoint: 'http://localhost:9222',
      }),
    }

    const runtime = {
      browserDomBridge,
      cdpBridgeManager,
      config: createTestConfig({
        approvalMode: 'never',
        defaultCaptureAfter: false,
        executor: 'dry-run',
      }),
      executor,
      session,
      stateManager,
      taskMemory: {},
      terminalRunner,
    } as unknown as ComputerUseServerRuntime

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({
      input: {
        captureAfter: false,
        text: 'hello',
        x: 300,
        y: 400,
      },
      kind: 'type_text',
    }, 'desktop_type_text')

    expect(result.isError).not.toBe(true)
    expect(executor.click).toHaveBeenCalledOnce()
    expect(executor.typeText).toHaveBeenCalledOnce()
    expect(browserDomBridge.setInputValue).not.toHaveBeenCalled()
  })

  it('falls back to OS typing when the connected extension transport does not support setInputValue', async () => {
    const stateManager = new RunStateManager()
    stateManager.updateGroundingSnapshot({
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Google Chrome',
      screenshot: { capturedAt: new Date().toISOString(), dataBase64: '', mimeType: 'image/png', path: '' },
      snapshotId: 'dg_1',
      staleFlags: { ax: false, chromeSemantic: false, screenshot: false },
      targetCandidates: [
        {
          appName: 'Google Chrome',
          bounds: { height: 28, width: 140, x: 100, y: 200 },
          confidence: 0.98,
          frameId: 0,
          id: 't_0',
          inputType: 'text',
          interactable: true,
          isPageContent: true,
          label: 'Email',
          role: 'textbox',
          selector: '#email',
          source: 'chrome_dom',
          tag: 'input',
        },
      ],
      windows: [],
    } as any)
    stateManager.updatePointerIntent({
      candidateId: 't_0',
      confidence: 0.98,
      executionResult: 'success',
      mode: 'execute',
      path: [{ delayMs: 0, x: 120, y: 214 }],
      phase: 'completed',
      rawPoint: { x: 120, y: 214 },
      snappedPoint: { x: 120, y: 214 },
      source: 'chrome_dom',
    }, 't_0')

    const session = {
      consumeOperation: vi.fn(),
      createPendingAction: vi.fn(),
      getBudgetState: vi.fn().mockReturnValue({
        operationsExecuted: 0,
        operationUnitsConsumed: 0,
      }),
      getLastScreenshot: vi.fn().mockReturnValue(undefined),
      getPointerPosition: vi.fn().mockReturnValue({ x: 0, y: 0 }),
      getTerminalState: vi.fn().mockReturnValue(createTerminalState()),
      listPendingActions: vi.fn().mockReturnValue([]),
      record: vi.fn().mockResolvedValue(undefined),
      setLastScreenshot: vi.fn(),
      setPointerPosition: vi.fn(),
      setTerminalState: vi.fn(),
    }
    const executor = {
      click: vi.fn(),
      describe: () => ({ kind: 'dry-run' as const, notes: [] }),
      focusApp: vi.fn(),
      getDisplayInfo: vi.fn().mockResolvedValue(createDisplayInfo({
        platform: 'darwin',
      })),
      getExecutionTarget: vi.fn().mockResolvedValue(createLocalExecutionTarget()),
      getForegroundContext: vi.fn().mockResolvedValue({
        appName: 'Google Chrome',
        available: true,
        platform: 'darwin',
      }),
      getPermissionInfo: vi.fn(),
      kind: 'dry-run' as const,
      observeWindows: vi.fn(),
      openApp: vi.fn(),
      pressKeys: vi.fn(),
      scroll: vi.fn(),
      takeScreenshot: vi.fn(),
      typeText: vi.fn().mockResolvedValue({
        backend: 'dry-run' as const,
        notes: [],
        performed: true,
      }),
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
        connected: true,
        enabled: true,
        host: '127.0.0.1',
        pendingRequests: 0,
        port: 8765,
      }),
      setInputValue: vi.fn().mockResolvedValue(undefined),
      supportsAction: vi.fn().mockImplementation((action: string) => action !== 'setInputValue'),
    }
    const cdpBridgeManager = {
      probeAvailability: vi.fn().mockResolvedValue({
        connectable: true,
        connected: false,
        endpoint: 'http://localhost:9222',
      }),
    }

    const runtime = {
      browserDomBridge,
      cdpBridgeManager,
      config: createTestConfig({
        approvalMode: 'never',
        defaultCaptureAfter: false,
        executor: 'dry-run',
      }),
      executor,
      session,
      stateManager,
      taskMemory: {},
      terminalRunner,
    } as unknown as ComputerUseServerRuntime

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({
      input: {
        captureAfter: false,
        text: 'hello',
      },
      kind: 'type_text',
    }, 'desktop_type_text')

    expect(result.isError).not.toBe(true)
    expect(executor.typeText).toHaveBeenCalledOnce()
    expect(browserDomBridge.setInputValue).not.toHaveBeenCalled()
  })

  it('records main-display metadata while preserving original global logical click coordinates', async () => {
    const { executor, runtime } = createRuntimeForActionTest(createCombinedDisplayBoundsConfig())
    executor.getDisplayInfo.mockResolvedValue(createMultiDisplayInfo())

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ input: { button: 'left', captureAfter: false, x: 100, y: 50 }, kind: 'click' }, 'desktop_click')

    expect(result.isError).not.toBe(true)
    expect(executor.click).toHaveBeenCalledWith(expect.objectContaining({
      pointerTrace: expect.arrayContaining([
        expect.objectContaining({ x: 100, y: 50 }),
      ]),
      x: 100,
      y: 50,
    }))

    const structured = result.structuredContent as Record<string, any>
    expect(structured.backendResult.displayPoint).toMatchObject({
      backingPixel: { x: 200, y: 100 },
      coordinateSpace: 'global-logical',
      displayId: 1,
      global: { x: 100, y: 50 },
      local: { x: 100, y: 50 },
      scaleFactor: 2,
    })
  })

  it('accepts negative-coordinate external display clicks and records display-local metadata', async () => {
    const { executor, runtime } = createRuntimeForActionTest(createCombinedDisplayBoundsConfig())
    executor.getDisplayInfo.mockResolvedValue(createMultiDisplayInfo())

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ input: { captureAfter: false, x: -100, y: -500 }, kind: 'click' }, 'desktop_click')

    expect(result.isError).not.toBe(true)
    expect(executor.click).toHaveBeenCalledWith(expect.objectContaining({
      pointerTrace: expect.arrayContaining([
        expect.objectContaining({ x: -100, y: -500 }),
      ]),
      x: -100,
      y: -500,
    }))

    const structured = result.structuredContent as Record<string, any>
    expect(structured.backendResult.displayPoint).toMatchObject({
      backingPixel: { x: 122, y: 580 },
      coordinateSpace: 'global-logical',
      displayId: 3,
      global: { x: -100, y: -500 },
      local: { x: 122, y: 580 },
      scaleFactor: 1,
    })
  })

  it('rejects physical-pixel-looking Retina coordinates outside the global logical display contract', async () => {
    const { executor, runtime } = createRuntimeForActionTest({
      allowedBounds: { height: 20_000, width: 20_000, x: -10_000, y: -10_000 },
    })
    executor.getDisplayInfo.mockResolvedValue(createMultiDisplayInfo())

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ input: { captureAfter: false, x: 2000, y: 500 }, kind: 'click' }, 'desktop_click')

    expect(result.isError).toBe(true)
    expect(executor.click).not.toHaveBeenCalled()
    expect((result.content[0] as { text: string }).text).toContain('outside connected display bounds')
  })

  it('uses the same display resolver for type_text preparatory clicks', async () => {
    const { executor, runtime } = createRuntimeForActionTest(createCombinedDisplayBoundsConfig())
    executor.getDisplayInfo.mockResolvedValue(createMultiDisplayInfo())
    executor.typeText.mockResolvedValue({
      backend: 'dry-run' as const,
      notes: [],
      performed: true,
    })

    const executeAction = createExecuteAction(runtime)
    const result = await executeAction({ input: { captureAfter: false, text: 'hello', x: -100, y: -500 }, kind: 'type_text' }, 'desktop_type_text')

    expect(result.isError).not.toBe(true)
    expect(executor.click).toHaveBeenCalledWith(expect.objectContaining({
      x: -100,
      y: -500,
    }))
    expect(executor.typeText).toHaveBeenCalledTimes(1)

    const structured = result.structuredContent as Record<string, any>
    expect(structured.backendResult.focusDisplayPoint).toMatchObject({
      backingPixel: { x: 122, y: 580 },
      displayId: 3,
      local: { x: 122, y: 580 },
    })
  })
})
