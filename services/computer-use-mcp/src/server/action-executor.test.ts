import type { ComputerUseServerRuntime } from './runtime'

import { describe, expect, it, vi } from 'vitest'

import { RunStateManager } from '../state'
import { createDisplayInfo, createLocalExecutionTarget, createTerminalState, createTestConfig } from '../test-fixtures'
import { createExecuteAction } from './action-executor'

function createRuntimeForActionTest() {
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
    }),
    session,
    executor,
    terminalRunner,
    browserDomBridge,
    cdpBridgeManager,
    stateManager,
    taskMemory: {},
  } as unknown as ComputerUseServerRuntime

  return {
    runtime,
    session,
    executor,
    cdpBridgeManager,
    stateManager,
  }
}

describe('createExecuteAction', () => {
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
})
