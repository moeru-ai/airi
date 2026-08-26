import type {
  DesktopGroundingSnapshot,
  DesktopTargetCandidate,
  PointerIntent,
  TargetSource,
} from '../desktop-grounding-types'

import { describe, expect, it, vi } from 'vitest'

import { getUnsupportedBrowserDomActions, isBrowserDomActionSupported } from '../browser-dom/capabilities'
import { RunStateManager } from '../state'
import { errorMessageFromValue } from '../utils/error-message'

// ---------------------------------------------------------------------------
// Test grounding state management through RunStateManager
// (the tools delegate all state to RunStateManager, so we test that interface)
// ---------------------------------------------------------------------------

function makeCandidate(overrides: Partial<DesktopTargetCandidate> = {}): DesktopTargetCandidate {
  return {
    appName: 'Google Chrome',
    bounds: { height: 30, width: 80, x: 100, y: 200 },
    confidence: 0.95,
    id: overrides.id ?? 't_0',
    interactable: true,
    label: 'Submit',
    role: 'button',
    source: overrides.source ?? 'chrome_dom',
    ...overrides,
  }
}

function makeSnapshot(candidates: DesktopTargetCandidate[] = [makeCandidate()]): DesktopGroundingSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    foregroundApp: 'Google Chrome',
    screenshot: { capturedAt: new Date().toISOString(), dataBase64: '', mimeType: 'image/png', path: '' },
    snapshotId: 'dg_1',
    staleFlags: { ax: false, chromeSemantic: false, screenshot: false },
    targetCandidates: candidates,
    windows: [],
  } as DesktopGroundingSnapshot
}

describe('runStateManager grounding state', () => {
  it('starts with no grounding state', () => {
    const sm = new RunStateManager()
    const state = sm.getState()
    expect(state.lastGroundingSnapshot).toBeUndefined()
    expect(state.lastPointerIntent).toBeUndefined()
    expect(state.lastClickedCandidateId).toBeUndefined()
  })

  it('stores snapshot via updateGroundingSnapshot', () => {
    const sm = new RunStateManager()
    const snapshot = makeSnapshot()
    sm.updateGroundingSnapshot(snapshot)

    const state = sm.getState()
    expect(state.lastGroundingSnapshot).toBe(snapshot)
    expect(state.lastClickedCandidateId).toBeUndefined()
  })

  it('resets lastClickedCandidateId on fresh observe', () => {
    const sm = new RunStateManager()
    sm.updatePointerIntent({
      candidateId: 't_0',
      confidence: 0.95,
      mode: 'execute',
      path: [{ delayMs: 0, x: 140, y: 215 }],
      rawPoint: { x: 140, y: 215 },
      snappedPoint: { x: 140, y: 215 },
      source: 'chrome_dom' as TargetSource,
    }, 't_0')

    expect(sm.getState().lastClickedCandidateId).toBe('t_0')

    // Fresh observe resets the clicked candidate
    sm.updateGroundingSnapshot(makeSnapshot())
    expect(sm.getState().lastClickedCandidateId).toBeUndefined()
  })

  it('stores pointer intent via updatePointerIntent', () => {
    const sm = new RunStateManager()
    const intent = {
      candidateId: 't_1',
      confidence: 0.9,
      mode: 'execute' as const,
      path: [{ delayMs: 0, x: 330, y: 213 }],
      rawPoint: { x: 300, y: 200 },
      snappedPoint: { x: 330, y: 213 },
      source: 'chrome_dom' as TargetSource,
    }
    sm.updatePointerIntent(intent, 't_1')

    const state = sm.getState()
    expect(state.lastPointerIntent).toBe(intent)
    expect(state.lastClickedCandidateId).toBe('t_1')
  })

  it('clearGroundingState resets everything', () => {
    const sm = new RunStateManager()
    sm.updateGroundingSnapshot(makeSnapshot())
    sm.updatePointerIntent({
      candidateId: 't_0',
      confidence: 0.95,
      mode: 'execute',
      path: [{ delayMs: 0, x: 140, y: 215 }],
      rawPoint: { x: 140, y: 215 },
      snappedPoint: { x: 140, y: 215 },
      source: 'chrome_dom' as TargetSource,
    }, 't_0')

    sm.clearGroundingState()

    const state = sm.getState()
    expect(state.lastGroundingSnapshot).toBeUndefined()
    expect(state.lastPointerIntent).toBeUndefined()
    expect(state.lastClickedCandidateId).toBeUndefined()
  })
})

describe('desktop_click_target preconditions via RunStateManager', () => {
  it('rejects when no snapshot is available', () => {
    const sm = new RunStateManager()
    const state = sm.getState()
    expect(!!state.lastGroundingSnapshot).toBe(false)
  })

  it('rejects duplicate click on same candidate', () => {
    const sm = new RunStateManager()
    sm.updateGroundingSnapshot(makeSnapshot())
    sm.updatePointerIntent({
      candidateId: 't_0',
      confidence: 0.95,
      mode: 'execute',
      path: [{ delayMs: 0, x: 140, y: 215 }],
      rawPoint: { x: 140, y: 215 },
      snappedPoint: { x: 140, y: 215 },
      source: 'chrome_dom' as TargetSource,
    }, 't_0')

    expect(sm.getState().lastClickedCandidateId === 't_0').toBe(true)
  })

  it('allows click on different candidate', () => {
    const sm = new RunStateManager()
    sm.updateGroundingSnapshot(makeSnapshot([
      makeCandidate({ id: 't_0' }),
      makeCandidate({ id: 't_1', label: 'Cancel' }),
    ]))
    sm.updatePointerIntent({
      candidateId: 't_0',
      confidence: 0.95,
      mode: 'execute',
      path: [{ delayMs: 0, x: 140, y: 215 }],
      rawPoint: { x: 140, y: 215 },
      snappedPoint: { x: 140, y: 215 },
      source: 'chrome_dom' as TargetSource,
    }, 't_0')

    expect(sm.getState().lastClickedCandidateId === 't_1').toBe(false)
  })

  it('allows re-click after re-observe', () => {
    const sm = new RunStateManager()
    sm.updateGroundingSnapshot(makeSnapshot())
    sm.updatePointerIntent({
      candidateId: 't_0',
      confidence: 0.95,
      mode: 'execute',
      path: [{ delayMs: 0, x: 140, y: 215 }],
      rawPoint: { x: 140, y: 215 },
      snappedPoint: { x: 140, y: 215 },
      source: 'chrome_dom' as TargetSource,
    }, 't_0')

    // Re-observe resets clicked candidate
    sm.updateGroundingSnapshot(makeSnapshot())
    expect(sm.getState().lastClickedCandidateId === 't_0').toBe(false)
  })
})

describe('snap resolution integration', () => {
  it('resolves candidate by id from snapshot', async () => {
    const { resolveSnapByCandidate } = await import('../snap-resolver')

    const snapshot = makeSnapshot([
      makeCandidate({ bounds: { height: 30, width: 80, x: 100, y: 200 }, id: 't_0' }),
      makeCandidate({ bounds: { height: 25, width: 60, x: 300, y: 200 }, id: 't_1', label: 'Cancel' }),
    ])

    const snap = resolveSnapByCandidate('t_1', snapshot)
    expect(snap.candidateId).toBe('t_1')
    expect(snap.snappedPoint).toEqual({ x: 330, y: 213 })
    expect(snap.source).toBe('chrome_dom')
  })

  it('returns error for missing candidate', async () => {
    const { resolveSnapByCandidate } = await import('../snap-resolver')
    const snapshot = makeSnapshot()

    const snap = resolveSnapByCandidate('t_99', snapshot)
    expect(snap.source).toBe('none')
    expect(snap.reason).toContain('not found')
  })
})

describe('overlay polling contract: desktop_get_state exposes grounding data', () => {
  it('exposes lastGroundingSnapshot after updateGroundingSnapshot', () => {
    const sm = new RunStateManager()
    const snapshot = makeSnapshot([
      makeCandidate({ id: 't_0' }),
      makeCandidate({ id: 't_1', label: 'Cancel' }),
    ])

    sm.updateGroundingSnapshot(snapshot)

    const state = sm.getState()
    expect(state.lastGroundingSnapshot).toBeDefined()
    expect(state.lastGroundingSnapshot!.snapshotId).toBe('dg_1')
    expect(state.lastGroundingSnapshot!.targetCandidates).toHaveLength(2)
    expect(state.lastGroundingSnapshot!.staleFlags).toEqual({
      ax: false,
      chromeSemantic: false,
      screenshot: false,
    })
  })

  it('exposes lastPointerIntent after updatePointerIntent', () => {
    const sm = new RunStateManager()
    sm.updateGroundingSnapshot(makeSnapshot())
    sm.updatePointerIntent({
      candidateId: 't_0',
      confidence: 0.95,
      mode: 'execute',
      path: [{ delayMs: 0, x: 140, y: 215 }],
      rawPoint: { x: 140, y: 215 },
      snappedPoint: { x: 140, y: 215 },
      source: 'chrome_dom' as TargetSource,
    }, 't_0')

    const state = sm.getState()
    expect(state.lastPointerIntent).toBeDefined()
    expect(state.lastPointerIntent!.candidateId).toBe('t_0')
    expect(state.lastPointerIntent!.snappedPoint).toEqual({ x: 140, y: 215 })
    expect(state.lastPointerIntent!.source).toBe('chrome_dom')
    expect(state.lastClickedCandidateId).toBe('t_0')
  })

  it('returns stable shape when no grounding state exists', () => {
    const sm = new RunStateManager()

    const state = sm.getState()
    expect(state.lastGroundingSnapshot).toBeUndefined()
    expect(state.lastPointerIntent).toBeUndefined()
    expect(state.lastClickedCandidateId).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// desktop_click_target handler integration tests
//
// These simulate the handler execution path from register-desktop-grounding.ts
// with mocked runtime dependencies to verify that routing decisions translate
// into real bridge/executor calls and correct response text.
// ---------------------------------------------------------------------------

describe('desktop_click_target handler integration', () => {
  // Replicates the handler logic from register-desktop-grounding.ts
  // into a testable function. Uses the same imports the handler uses.
  async function simulateClickTargetHandler(params: {
    browserDomBridge: {
      checkCheckbox: (args: { frameIds?: number[], selector: string }) => Promise<void>
      clickSelector: (args: { frameIds?: number[], selector: string }) => Promise<void>
      getStatus: () => { connected: boolean }
      supportsAction?: (action: string) => boolean
    }
    button?: string
    candidateId: string
    clickCount?: number
    executor: {
      click: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
    }
    stateManager: RunStateManager
  }) {
    const { browserDomBridge, button, candidateId, clickCount, executor, stateManager } = params
    const { decideBrowserAction } = await import('../browser-action-router')
    const { resolveSnapByCandidate } = await import('../snap-resolver')

    const state = stateManager.getState()

    if (!state.lastGroundingSnapshot) {
      return { isError: true, text: 'No snapshot' }
    }

    const snapshot = state.lastGroundingSnapshot

    if (state.lastClickedCandidateId === candidateId) {
      return { isError: true, text: `Already clicked ${candidateId}` }
    }

    const snapshotAge = Date.now() - new Date(snapshot.capturedAt).getTime()
    if (snapshotAge > 5000) {
      return { isError: true, text: `Stale snapshot (${Math.round(snapshotAge / 1000)}s)` }
    }

    try {
      const snap = resolveSnapByCandidate(candidateId, snapshot)
      if (snap.source === 'none' && !snap.candidateId) {
        return { isError: true, text: `Not found: ${candidateId}` }
      }

      const intent: PointerIntent = {
        candidateId,
        confidence: snapshot.targetCandidates.find(c => c.id === candidateId)?.confidence ?? 0,
        mode: 'execute' as const,
        path: [{ delayMs: 0, x: snap.snappedPoint.x, y: snap.snappedPoint.y }],
        rawPoint: snap.rawPoint,
        snappedPoint: snap.snappedPoint,
        source: snap.source,
      }
      stateManager.updatePointerIntent(intent)

      const candidate = snapshot.targetCandidates.find(c => c.id === candidateId)
      const bridgeConnected = browserDomBridge.getStatus().connected
      const routeDecision = candidate
        ? decideBrowserAction(candidate, bridgeConnected)
        : { reason: 'candidate not found', route: 'os_input' as const }

      let executionRoute = routeDecision.route
      let routeNote = ''
      let routeReason = routeDecision.reason

      if (routeDecision.route === 'browser_dom' && routeDecision.selector) {
        const requiredActions = routeDecision.bridgeMethod === 'checkCheckbox'
          ? ['checkCheckbox']
          : ['getClickTarget', 'clickAt']

        if (!isBrowserDomActionSupported(browserDomBridge, ...requiredActions)) {
          executionRoute = 'os_input'
          routeReason = `browser-dom extension transport does not support ${requiredActions.join(' + ')}`
          routeNote = `browser-dom ${routeDecision.bridgeMethod ?? 'click'} is unavailable on the connected extension transport (${getUnsupportedBrowserDomActions(browserDomBridge, ...requiredActions).join(', ')} unsupported), fell back to OS input`
          await executor.click({
            button: button || 'left',
            clickCount: clickCount ?? 1,
            x: snap.snappedPoint.x,
            y: snap.snappedPoint.y,
          })
        }
        else {
          try {
            const frameIds = routeDecision.frameId !== undefined ? [routeDecision.frameId] : undefined
            if (routeDecision.bridgeMethod === 'checkCheckbox') {
              await browserDomBridge.checkCheckbox({ frameIds, selector: routeDecision.selector })
            }
            else {
              await browserDomBridge.clickSelector({ frameIds, selector: routeDecision.selector })
            }
          }
          catch (browserError) {
            executionRoute = 'os_input'
            routeNote = `browser-dom failed: ${errorMessageFromValue(browserError)}`
            await executor.click({
              button: button || 'left',
              clickCount: clickCount ?? 1,
              x: snap.snappedPoint.x,
              y: snap.snappedPoint.y,
            })
          }
        }
      }
      else {
        await executor.click({
          button: button || 'left',
          clickCount: clickCount ?? 1,
          x: snap.snappedPoint.x,
          y: snap.snappedPoint.y,
        })
      }

      intent.phase = 'completed'
      intent.executionResult = routeNote ? 'fallback' : 'success'
      intent.executionRoute = `${executionRoute} (${routeReason})`
      stateManager.updatePointerIntent(intent, candidateId)

      const candidateDesc = candidate
        ? `${candidate.source} ${candidate.role} "${candidate.label}"`
        : candidateId

      const lines = [
        `Clicked: ${candidateDesc}`,
        `  Snap: ${snap.reason}`,
        `  Point: (${snap.snappedPoint.x}, ${snap.snappedPoint.y})`,
        `  Route: ${executionRoute} (${routeReason})`,
        `  Button: ${button || 'left'}, clicks: ${clickCount ?? 1}`,
      ]
      if (routeNote)
        lines.push(`  ⚠ ${routeNote}`)

      return { executionRoute, isError: false, routeNote, routeReason, text: lines.join('\n') }
    }
    catch (error) {
      const message = errorMessageFromValue(error)
      return { isError: true, text: `desktop_click_target failed: ${message}` }
    }
  }

  function freshSnapshot(candidates: DesktopTargetCandidate[]): DesktopGroundingSnapshot {
    return {
      capturedAt: new Date().toISOString(), // fresh = now
      foregroundApp: 'Google Chrome',
      screenshot: { capturedAt: new Date().toISOString(), dataBase64: '', mimeType: 'image/png', path: '' },
      snapshotId: 'dg_fresh',
      staleFlags: { ax: false, chromeSemantic: false, screenshot: false },
      targetCandidates: candidates,
      windows: [],
    } as DesktopGroundingSnapshot
  }

  function makeMockBridge(connected: boolean) {
    return {
      checkCheckbox: vi.fn().mockResolvedValue(undefined),
      clickSelector: vi.fn().mockResolvedValue(undefined),
      getStatus: () => ({ connected }),
      supportsAction: vi.fn().mockReturnValue(true),
    }
  }

  function makeMockExecutor() {
    return {
      click: vi.fn().mockResolvedValue({}),
    }
  }

  // -----------------------------------------------------------------------
  // browser_dom routing: calls clickSelector
  // -----------------------------------------------------------------------

  it('routes chrome_dom candidate through clickSelector when bridge is connected', async () => {
    const sm = new RunStateManager()
    const candidate = makeCandidate({
      frameId: 0,
      id: 't_0',
      isPageContent: true,
      selector: '#login-btn',
      source: 'chrome_dom',
    })
    sm.updateGroundingSnapshot(freshSnapshot([candidate]))

    const bridge = makeMockBridge(true)
    const executor = makeMockExecutor()

    const result = await simulateClickTargetHandler({
      browserDomBridge: bridge,
      candidateId: 't_0',
      executor,
      stateManager: sm,
    })

    expect(result.isError).toBe(false)
    expect(result.executionRoute).toBe('browser_dom')
    expect(bridge.clickSelector).toHaveBeenCalledOnce()
    expect(bridge.clickSelector).toHaveBeenCalledWith({
      frameIds: [0],
      selector: '#login-btn',
    })
    expect(executor.click).not.toHaveBeenCalled()
    expect(result.text).toContain('Route: browser_dom')
  })

  it('falls back to OS click when the connected extension transport is read-only', async () => {
    const sm = new RunStateManager()
    const iframeAbsoluteBounds = { height: 32, width: 90, x: 456, y: 390 }
    const candidate = makeCandidate({
      bounds: iframeAbsoluteBounds,
      frameId: 7,
      id: 't_0',
      isPageContent: true,
      selector: '#login-btn',
      source: 'chrome_dom',
    })
    sm.updateGroundingSnapshot(freshSnapshot([candidate]))

    const bridge = makeMockBridge(true)
    bridge.supportsAction.mockImplementation((action: string) => action !== 'clickAt')
    const executor = makeMockExecutor()

    const result = await simulateClickTargetHandler({
      browserDomBridge: bridge,
      candidateId: 't_0',
      executor,
      stateManager: sm,
    })

    expect(result.isError).toBe(false)
    expect(result.executionRoute).toBe('os_input')
    expect(result.routeReason).toContain('does not support getClickTarget + clickAt')
    expect(bridge.clickSelector).not.toHaveBeenCalled()
    expect(executor.click).toHaveBeenCalledWith({
      button: 'left',
      clickCount: 1,
      x: 501,
      y: 406,
    })
    expect(result.text).toContain('Point: (501, 406)')
  })

  // -----------------------------------------------------------------------
  // browser_dom fallback: clickSelector fails → executor.click
  // -----------------------------------------------------------------------

  it('falls back to OS click when clickSelector throws', async () => {
    const sm = new RunStateManager()
    const candidate = makeCandidate({
      frameId: 0,
      id: 't_0',
      selector: '#broken',
      source: 'chrome_dom',
    })
    sm.updateGroundingSnapshot(freshSnapshot([candidate]))

    const bridge = makeMockBridge(true)
    bridge.clickSelector.mockRejectedValue(new Error('Element not found'))
    const executor = makeMockExecutor()

    const result = await simulateClickTargetHandler({
      browserDomBridge: bridge,
      candidateId: 't_0',
      executor,
      stateManager: sm,
    })

    expect(result.isError).toBe(false)
    expect(result.executionRoute).toBe('os_input')
    expect(bridge.clickSelector).toHaveBeenCalledOnce()
    expect(executor.click).toHaveBeenCalledOnce()
    expect(result.text).toContain('Route: os_input')
    expect(result.text).toContain('browser-dom failed')
    expect(result.text).toContain('Element not found')
  })

  it('does not poison duplicate-click guard when the click path fails', async () => {
    const sm = new RunStateManager()
    const candidate = makeCandidate({
      id: 't_0',
      selector: undefined,
      source: 'ax',
    })
    sm.updateGroundingSnapshot(freshSnapshot([candidate]))

    const bridge = makeMockBridge(true)
    const executor = {
      click: vi.fn().mockRejectedValue(new Error('transient click failure')),
    }

    const first = await simulateClickTargetHandler({
      browserDomBridge: bridge,
      candidateId: 't_0',
      executor,
      stateManager: sm,
    })
    expect(first.isError).toBe(true)
    expect(sm.getState().lastClickedCandidateId).toBeUndefined()

    executor.click.mockResolvedValueOnce({})
    const second = await simulateClickTargetHandler({
      browserDomBridge: bridge,
      candidateId: 't_0',
      executor,
      stateManager: sm,
    })
    expect(second.isError).toBe(false)
    expect(sm.getState().lastClickedCandidateId).toBe('t_0')
  })

  // -----------------------------------------------------------------------
  // checkbox: routes to checkCheckbox, not clickSelector
  // -----------------------------------------------------------------------

  it('dispatches to checkCheckbox for checkbox candidates', async () => {
    const sm = new RunStateManager()
    const candidate = makeCandidate({
      frameId: 0,
      id: 't_0',
      inputType: 'checkbox',
      role: 'checkbox',
      selector: '#agree',
      source: 'chrome_dom',
      tag: 'input',
    })
    sm.updateGroundingSnapshot(freshSnapshot([candidate]))

    const bridge = makeMockBridge(true)
    const executor = makeMockExecutor()

    const result = await simulateClickTargetHandler({
      browserDomBridge: bridge,
      candidateId: 't_0',
      executor,
      stateManager: sm,
    })

    expect(result.isError).toBe(false)
    expect(bridge.checkCheckbox).toHaveBeenCalledOnce()
    expect(bridge.checkCheckbox).toHaveBeenCalledWith({
      frameIds: [0],
      selector: '#agree',
    })
    expect(bridge.clickSelector).not.toHaveBeenCalled()
    expect(executor.click).not.toHaveBeenCalled()
    expect(result.text).toContain('Route: browser_dom')
    expect(result.text).toContain('checkCheckbox')
  })

  // -----------------------------------------------------------------------
  // AX candidate: bypasses browser-dom entirely
  // -----------------------------------------------------------------------

  it('routes AX candidate directly to OS click, never touches bridge', async () => {
    const sm = new RunStateManager()
    const candidate = makeCandidate({
      id: 't_0',
      label: 'Close',
      role: 'AXButton',
      selector: undefined,
      source: 'ax',
    })
    sm.updateGroundingSnapshot(freshSnapshot([candidate]))

    const bridge = makeMockBridge(true)
    const executor = makeMockExecutor()

    const result = await simulateClickTargetHandler({
      browserDomBridge: bridge,
      candidateId: 't_0',
      executor,
      stateManager: sm,
    })

    expect(result.isError).toBe(false)
    expect(result.executionRoute).toBe('os_input')
    expect(bridge.clickSelector).not.toHaveBeenCalled()
    expect(bridge.checkCheckbox).not.toHaveBeenCalled()
    expect(executor.click).toHaveBeenCalledOnce()
    expect(result.text).toContain('Route: os_input')
  })

  // -----------------------------------------------------------------------
  // Bridge disconnected: chrome_dom candidate falls back to OS
  // -----------------------------------------------------------------------

  it('routes chrome_dom to OS click when bridge is disconnected', async () => {
    const sm = new RunStateManager()
    const candidate = makeCandidate({
      id: 't_0',
      selector: '#btn',
      source: 'chrome_dom',
    })
    sm.updateGroundingSnapshot(freshSnapshot([candidate]))

    const bridge = makeMockBridge(false) // disconnected
    const executor = makeMockExecutor()

    const result = await simulateClickTargetHandler({
      browserDomBridge: bridge,
      candidateId: 't_0',
      executor,
      stateManager: sm,
    })

    expect(result.isError).toBe(false)
    expect(result.executionRoute).toBe('os_input')
    expect(bridge.clickSelector).not.toHaveBeenCalled()
    expect(executor.click).toHaveBeenCalledOnce()
    expect(result.text).toContain('not connected')
  })

  // -----------------------------------------------------------------------
  // No selector: chrome_dom candidate without selector → OS click
  // -----------------------------------------------------------------------

  it('routes chrome_dom without selector to OS click', async () => {
    const sm = new RunStateManager()
    const candidate = makeCandidate({
      id: 't_0',
      selector: undefined,
      source: 'chrome_dom',
    })
    sm.updateGroundingSnapshot(freshSnapshot([candidate]))

    const bridge = makeMockBridge(true)
    const executor = makeMockExecutor()

    const result = await simulateClickTargetHandler({
      browserDomBridge: bridge,
      candidateId: 't_0',
      executor,
      stateManager: sm,
    })

    expect(result.isError).toBe(false)
    expect(result.executionRoute).toBe('os_input')
    expect(bridge.clickSelector).not.toHaveBeenCalled()
    expect(executor.click).toHaveBeenCalledOnce()
    expect(result.text).toContain('no CSS selector')
  })

  // -----------------------------------------------------------------------
  // Duplicate click guard
  // -----------------------------------------------------------------------

  it('blocks duplicate click on same candidate without re-observe', async () => {
    const sm = new RunStateManager()
    const candidate = makeCandidate({ id: 't_0' })
    sm.updateGroundingSnapshot(freshSnapshot([candidate]))

    const bridge = makeMockBridge(true)
    const executor = makeMockExecutor()

    // First click succeeds
    const first = await simulateClickTargetHandler({
      browserDomBridge: bridge,
      candidateId: 't_0',
      executor,
      stateManager: sm,
    })
    expect(first.isError).toBe(false)

    // Second click on same candidate without re-observe → blocked
    const second = await simulateClickTargetHandler({
      browserDomBridge: bridge,
      candidateId: 't_0',
      executor,
      stateManager: sm,
    })
    expect(second.isError).toBe(true)
    expect(second.text).toContain('Already clicked')
  })

  // -----------------------------------------------------------------------
  // Duplicate guard reset after re-observe
  // -----------------------------------------------------------------------

  it('allows same candidate click after re-observe', async () => {
    const sm = new RunStateManager()
    const candidate = makeCandidate({ id: 't_0' })
    sm.updateGroundingSnapshot(freshSnapshot([candidate]))

    const bridge = makeMockBridge(true)
    const executor = makeMockExecutor()

    // First click
    await simulateClickTargetHandler({
      browserDomBridge: bridge,
      candidateId: 't_0',
      executor,
      stateManager: sm,
    })

    // Re-observe resets the guard
    sm.updateGroundingSnapshot(freshSnapshot([makeCandidate({ id: 't_0' })]))

    // Click again after re-observe → allowed
    const result = await simulateClickTargetHandler({
      browserDomBridge: bridge,
      candidateId: 't_0',
      executor,
      stateManager: sm,
    })
    expect(result.isError).toBe(false)
  })

  // -----------------------------------------------------------------------
  // Stale snapshot rejection
  // -----------------------------------------------------------------------

  it('rejects click on stale snapshot (>5s)', async () => {
    const sm = new RunStateManager()
    const candidate = makeCandidate({ id: 't_0' })
    const staleSnapshot = {
      ...freshSnapshot([candidate]),
      capturedAt: new Date(Date.now() - 10_000).toISOString(), // 10s ago
    }
    sm.updateGroundingSnapshot(staleSnapshot)

    const bridge = makeMockBridge(true)
    const executor = makeMockExecutor()

    const result = await simulateClickTargetHandler({
      browserDomBridge: bridge,
      candidateId: 't_0',
      executor,
      stateManager: sm,
    })

    expect(result.isError).toBe(true)
    expect(result.text).toContain('Stale')
    expect(bridge.clickSelector).not.toHaveBeenCalled()
    expect(executor.click).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // Missing candidate
  // -----------------------------------------------------------------------

  it('returns error for non-existent candidate id', async () => {
    const sm = new RunStateManager()
    sm.updateGroundingSnapshot(freshSnapshot([makeCandidate({ id: 't_0' })]))

    const bridge = makeMockBridge(true)
    const executor = makeMockExecutor()

    const result = await simulateClickTargetHandler({
      browserDomBridge: bridge,
      candidateId: 't_99',
      executor,
      stateManager: sm,
    })

    expect(result.isError).toBe(true)
    expect(result.text).toContain('Not found')
    expect(bridge.clickSelector).not.toHaveBeenCalled()
    expect(executor.click).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // No snapshot
  // -----------------------------------------------------------------------

  it('returns error when no snapshot exists', async () => {
    const sm = new RunStateManager()
    const bridge = makeMockBridge(true)
    const executor = makeMockExecutor()

    const result = await simulateClickTargetHandler({
      browserDomBridge: bridge,
      candidateId: 't_0',
      executor,
      stateManager: sm,
    })

    expect(result.isError).toBe(true)
    expect(result.text).toContain('No snapshot')
  })

  // -----------------------------------------------------------------------
  // Frame ID passthrough
  // -----------------------------------------------------------------------

  it('passes non-zero frameId to clickSelector', async () => {
    const sm = new RunStateManager()
    const candidate = makeCandidate({
      frameId: 5,
      id: 't_0',
      selector: '#iframe-btn',
      source: 'chrome_dom',
    })
    sm.updateGroundingSnapshot(freshSnapshot([candidate]))

    const bridge = makeMockBridge(true)
    const executor = makeMockExecutor()

    await simulateClickTargetHandler({
      browserDomBridge: bridge,
      candidateId: 't_0',
      executor,
      stateManager: sm,
    })

    expect(bridge.clickSelector).toHaveBeenCalledWith({
      frameIds: [5],
      selector: '#iframe-btn',
    })
  })

  // -----------------------------------------------------------------------
  // checkCheckbox fallback on failure
  // -----------------------------------------------------------------------

  it('falls back to OS click when checkCheckbox throws', async () => {
    const sm = new RunStateManager()
    const candidate = makeCandidate({
      frameId: 0,
      id: 't_0',
      inputType: 'checkbox',
      role: 'checkbox',
      selector: '#cb',
      source: 'chrome_dom',
      tag: 'input',
    })
    sm.updateGroundingSnapshot(freshSnapshot([candidate]))

    const bridge = makeMockBridge(true)
    bridge.checkCheckbox.mockRejectedValue(new Error('checkbox toggle failed'))
    const executor = makeMockExecutor()

    const result = await simulateClickTargetHandler({
      browserDomBridge: bridge,
      candidateId: 't_0',
      executor,
      stateManager: sm,
    })

    expect(result.isError).toBe(false)
    expect(result.executionRoute).toBe('os_input')
    expect(bridge.checkCheckbox).toHaveBeenCalledOnce()
    expect(executor.click).toHaveBeenCalledOnce()
    expect(result.text).toContain('browser-dom failed')
    expect(result.text).toContain('checkbox toggle failed')
  })

  // -----------------------------------------------------------------------
  // Two candidates: click different ones in sequence
  // -----------------------------------------------------------------------

  it('allows clicking different candidates in sequence', async () => {
    const sm = new RunStateManager()
    sm.updateGroundingSnapshot(freshSnapshot([
      makeCandidate({ id: 't_0', label: 'First', selector: '#first' }),
      makeCandidate({ id: 't_1', label: 'Second', selector: '#second' }),
    ]))

    const bridge = makeMockBridge(true)
    const executor = makeMockExecutor()

    const first = await simulateClickTargetHandler({
      browserDomBridge: bridge,
      candidateId: 't_0',
      executor,
      stateManager: sm,
    })
    expect(first.isError).toBe(false)
    expect(first.text).toContain('First')

    const second = await simulateClickTargetHandler({
      browserDomBridge: bridge,
      candidateId: 't_1',
      executor,
      stateManager: sm,
    })
    expect(second.isError).toBe(false)
    expect(second.text).toContain('Second')
    expect(bridge.clickSelector).toHaveBeenCalledTimes(2)
  })
})
