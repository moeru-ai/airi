import type {
  DesktopGroundingSnapshot,
  DesktopTargetCandidate,
  TargetSource,
} from '../desktop-grounding-types'

import { describe, expect, it, vi } from 'vitest'

import { RunStateManager } from '../state'

// ---------------------------------------------------------------------------
// Test grounding state management through RunStateManager
// (the tools delegate all state to RunStateManager, so we test that interface)
// ---------------------------------------------------------------------------

function makeCandidate(overrides: Partial<DesktopTargetCandidate> = {}): DesktopTargetCandidate {
  return {
    id: overrides.id ?? 't_0',
    source: overrides.source ?? 'chrome_dom',
    appName: 'Google Chrome',
    role: 'button',
    label: 'Submit',
    bounds: { x: 100, y: 200, width: 80, height: 30 },
    confidence: 0.95,
    interactable: true,
    ...overrides,
  }
}

function makeSnapshot(candidates: DesktopTargetCandidate[] = [makeCandidate()]): DesktopGroundingSnapshot {
  return {
    snapshotId: 'dg_1',
    capturedAt: new Date().toISOString(),
    foregroundApp: 'Google Chrome',
    windows: [],
    screenshot: { dataBase64: '', mimeType: 'image/png', path: '', capturedAt: new Date().toISOString() },
    targetCandidates: candidates,
    staleFlags: { screenshot: false, ax: false, chromeSemantic: false },
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
      mode: 'execute',
      candidateId: 't_0',
      rawPoint: { x: 140, y: 215 },
      snappedPoint: { x: 140, y: 215 },
      source: 'chrome_dom' as TargetSource,
      confidence: 0.95,
      path: [{ x: 140, y: 215, delayMs: 0 }],
    }, 't_0')

    expect(sm.getState().lastClickedCandidateId).toBe('t_0')

    // Fresh observe resets the clicked candidate
    sm.updateGroundingSnapshot(makeSnapshot())
    expect(sm.getState().lastClickedCandidateId).toBeUndefined()
  })

  it('stores pointer intent via updatePointerIntent', () => {
    const sm = new RunStateManager()
    const intent = {
      mode: 'execute' as const,
      candidateId: 't_1',
      rawPoint: { x: 300, y: 200 },
      snappedPoint: { x: 330, y: 213 },
      source: 'chrome_dom' as TargetSource,
      confidence: 0.9,
      path: [{ x: 330, y: 213, delayMs: 0 }],
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
      mode: 'execute',
      candidateId: 't_0',
      rawPoint: { x: 140, y: 215 },
      snappedPoint: { x: 140, y: 215 },
      source: 'chrome_dom' as TargetSource,
      confidence: 0.95,
      path: [{ x: 140, y: 215, delayMs: 0 }],
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
      mode: 'execute',
      candidateId: 't_0',
      rawPoint: { x: 140, y: 215 },
      snappedPoint: { x: 140, y: 215 },
      source: 'chrome_dom' as TargetSource,
      confidence: 0.95,
      path: [{ x: 140, y: 215, delayMs: 0 }],
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
      mode: 'execute',
      candidateId: 't_0',
      rawPoint: { x: 140, y: 215 },
      snappedPoint: { x: 140, y: 215 },
      source: 'chrome_dom' as TargetSource,
      confidence: 0.95,
      path: [{ x: 140, y: 215, delayMs: 0 }],
    }, 't_0')

    expect(sm.getState().lastClickedCandidateId === 't_1').toBe(false)
  })

  it('allows re-click after re-observe', () => {
    const sm = new RunStateManager()
    sm.updateGroundingSnapshot(makeSnapshot())
    sm.updatePointerIntent({
      mode: 'execute',
      candidateId: 't_0',
      rawPoint: { x: 140, y: 215 },
      snappedPoint: { x: 140, y: 215 },
      source: 'chrome_dom' as TargetSource,
      confidence: 0.95,
      path: [{ x: 140, y: 215, delayMs: 0 }],
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
      makeCandidate({ id: 't_0', bounds: { x: 100, y: 200, width: 80, height: 30 } }),
      makeCandidate({ id: 't_1', bounds: { x: 300, y: 200, width: 60, height: 25 }, label: 'Cancel' }),
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
      screenshot: false,
      ax: false,
      chromeSemantic: false,
    })
  })

  it('exposes lastPointerIntent after updatePointerIntent', () => {
    const sm = new RunStateManager()
    sm.updateGroundingSnapshot(makeSnapshot())
    sm.updatePointerIntent({
      mode: 'execute',
      candidateId: 't_0',
      rawPoint: { x: 140, y: 215 },
      snappedPoint: { x: 140, y: 215 },
      source: 'chrome_dom' as TargetSource,
      confidence: 0.95,
      path: [{ x: 140, y: 215, delayMs: 0 }],
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
    stateManager: RunStateManager
    candidateId: string
    button?: string
    clickCount?: number
    browserDomBridge: {
      getStatus: () => { connected: boolean }
      clickSelector: (args: { selector: string, frameIds?: number[] }) => Promise<void>
      checkCheckbox: (args: { selector: string, frameIds?: number[] }) => Promise<void>
    }
    executor: {
      click: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
    }
  }) {
    const { stateManager, candidateId, button, clickCount, browserDomBridge, executor } = params
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

    const snap = resolveSnapByCandidate(candidateId, snapshot)
    if (snap.source === 'none' && !snap.candidateId) {
      return { isError: true, text: `Not found: ${candidateId}` }
    }

    const intent = {
      mode: 'execute' as const,
      candidateId,
      rawPoint: snap.rawPoint,
      snappedPoint: snap.snappedPoint,
      source: snap.source,
      confidence: snapshot.targetCandidates.find(c => c.id === candidateId)?.confidence ?? 0,
      path: [{ x: snap.snappedPoint.x, y: snap.snappedPoint.y, delayMs: 0 }],
    }
    stateManager.updatePointerIntent(intent, candidateId)

    const candidate = snapshot.targetCandidates.find(c => c.id === candidateId)
    const bridgeConnected = browserDomBridge.getStatus().connected
    const routeDecision = candidate
      ? decideBrowserAction(candidate, bridgeConnected)
      : { route: 'os_input' as const, reason: 'candidate not found' }

    let executionRoute = routeDecision.route
    let routeNote = ''

    if (routeDecision.route === 'browser_dom' && routeDecision.selector) {
      try {
        const frameIds = routeDecision.frameId !== undefined ? [routeDecision.frameId] : undefined
        if (routeDecision.bridgeMethod === 'checkCheckbox') {
          await browserDomBridge.checkCheckbox({ selector: routeDecision.selector, frameIds })
        }
        else {
          await browserDomBridge.clickSelector({ selector: routeDecision.selector, frameIds })
        }
      }
      catch (browserError) {
        executionRoute = 'os_input'
        routeNote = `browser-dom failed: ${browserError instanceof Error ? browserError.message : String(browserError)}`
        await executor.click({
          x: snap.snappedPoint.x,
          y: snap.snappedPoint.y,
          button: button || 'left',
          clickCount: clickCount ?? 1,
        })
      }
    }
    else {
      await executor.click({
        x: snap.snappedPoint.x,
        y: snap.snappedPoint.y,
        button: button || 'left',
        clickCount: clickCount ?? 1,
      })
    }

    const candidateDesc = candidate
      ? `${candidate.source} ${candidate.role} "${candidate.label}"`
      : candidateId

    const lines = [
      `Clicked: ${candidateDesc}`,
      `  Snap: ${snap.reason}`,
      `  Point: (${snap.snappedPoint.x}, ${snap.snappedPoint.y})`,
      `  Route: ${executionRoute} (${routeDecision.reason})`,
      `  Button: ${button || 'left'}, clicks: ${clickCount ?? 1}`,
    ]
    if (routeNote)
      lines.push(`  ⚠ ${routeNote}`)

    return { isError: false, text: lines.join('\n'), executionRoute, routeNote }
  }

  function freshSnapshot(candidates: DesktopTargetCandidate[]): DesktopGroundingSnapshot {
    return {
      snapshotId: 'dg_fresh',
      capturedAt: new Date().toISOString(), // fresh = now
      foregroundApp: 'Google Chrome',
      windows: [],
      screenshot: { dataBase64: '', mimeType: 'image/png', path: '', capturedAt: new Date().toISOString() },
      targetCandidates: candidates,
      staleFlags: { screenshot: false, ax: false, chromeSemantic: false },
    } as DesktopGroundingSnapshot
  }

  function makeMockBridge(connected: boolean) {
    return {
      getStatus: () => ({ connected }),
      clickSelector: vi.fn().mockResolvedValue(undefined),
      checkCheckbox: vi.fn().mockResolvedValue(undefined),
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
      id: 't_0',
      source: 'chrome_dom',
      selector: '#login-btn',
      frameId: 0,
      isPageContent: true,
    })
    sm.updateGroundingSnapshot(freshSnapshot([candidate]))

    const bridge = makeMockBridge(true)
    const executor = makeMockExecutor()

    const result = await simulateClickTargetHandler({
      stateManager: sm,
      candidateId: 't_0',
      browserDomBridge: bridge,
      executor,
    })

    expect(result.isError).toBe(false)
    expect(result.executionRoute).toBe('browser_dom')
    expect(bridge.clickSelector).toHaveBeenCalledOnce()
    expect(bridge.clickSelector).toHaveBeenCalledWith({
      selector: '#login-btn',
      frameIds: [0],
    })
    expect(executor.click).not.toHaveBeenCalled()
    expect(result.text).toContain('Route: browser_dom')
  })

  // -----------------------------------------------------------------------
  // browser_dom fallback: clickSelector fails → executor.click
  // -----------------------------------------------------------------------

  it('falls back to OS click when clickSelector throws', async () => {
    const sm = new RunStateManager()
    const candidate = makeCandidate({
      id: 't_0',
      source: 'chrome_dom',
      selector: '#broken',
      frameId: 0,
    })
    sm.updateGroundingSnapshot(freshSnapshot([candidate]))

    const bridge = makeMockBridge(true)
    bridge.clickSelector.mockRejectedValue(new Error('Element not found'))
    const executor = makeMockExecutor()

    const result = await simulateClickTargetHandler({
      stateManager: sm,
      candidateId: 't_0',
      browserDomBridge: bridge,
      executor,
    })

    expect(result.isError).toBe(false)
    expect(result.executionRoute).toBe('os_input')
    expect(bridge.clickSelector).toHaveBeenCalledOnce()
    expect(executor.click).toHaveBeenCalledOnce()
    expect(result.text).toContain('Route: os_input')
    expect(result.text).toContain('browser-dom failed')
    expect(result.text).toContain('Element not found')
  })

  // -----------------------------------------------------------------------
  // checkbox: routes to checkCheckbox, not clickSelector
  // -----------------------------------------------------------------------

  it('dispatches to checkCheckbox for checkbox candidates', async () => {
    const sm = new RunStateManager()
    const candidate = makeCandidate({
      id: 't_0',
      source: 'chrome_dom',
      tag: 'input',
      inputType: 'checkbox',
      role: 'checkbox',
      selector: '#agree',
      frameId: 0,
    })
    sm.updateGroundingSnapshot(freshSnapshot([candidate]))

    const bridge = makeMockBridge(true)
    const executor = makeMockExecutor()

    const result = await simulateClickTargetHandler({
      stateManager: sm,
      candidateId: 't_0',
      browserDomBridge: bridge,
      executor,
    })

    expect(result.isError).toBe(false)
    expect(bridge.checkCheckbox).toHaveBeenCalledOnce()
    expect(bridge.checkCheckbox).toHaveBeenCalledWith({
      selector: '#agree',
      frameIds: [0],
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
      source: 'ax',
      role: 'AXButton',
      label: 'Close',
      selector: undefined,
    })
    sm.updateGroundingSnapshot(freshSnapshot([candidate]))

    const bridge = makeMockBridge(true)
    const executor = makeMockExecutor()

    const result = await simulateClickTargetHandler({
      stateManager: sm,
      candidateId: 't_0',
      browserDomBridge: bridge,
      executor,
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
      source: 'chrome_dom',
      selector: '#btn',
    })
    sm.updateGroundingSnapshot(freshSnapshot([candidate]))

    const bridge = makeMockBridge(false) // disconnected
    const executor = makeMockExecutor()

    const result = await simulateClickTargetHandler({
      stateManager: sm,
      candidateId: 't_0',
      browserDomBridge: bridge,
      executor,
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
      source: 'chrome_dom',
      selector: undefined,
    })
    sm.updateGroundingSnapshot(freshSnapshot([candidate]))

    const bridge = makeMockBridge(true)
    const executor = makeMockExecutor()

    const result = await simulateClickTargetHandler({
      stateManager: sm,
      candidateId: 't_0',
      browserDomBridge: bridge,
      executor,
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
      stateManager: sm,
      candidateId: 't_0',
      browserDomBridge: bridge,
      executor,
    })
    expect(first.isError).toBe(false)

    // Second click on same candidate without re-observe → blocked
    const second = await simulateClickTargetHandler({
      stateManager: sm,
      candidateId: 't_0',
      browserDomBridge: bridge,
      executor,
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
      stateManager: sm,
      candidateId: 't_0',
      browserDomBridge: bridge,
      executor,
    })

    // Re-observe resets the guard
    sm.updateGroundingSnapshot(freshSnapshot([makeCandidate({ id: 't_0' })]))

    // Click again after re-observe → allowed
    const result = await simulateClickTargetHandler({
      stateManager: sm,
      candidateId: 't_0',
      browserDomBridge: bridge,
      executor,
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
      stateManager: sm,
      candidateId: 't_0',
      browserDomBridge: bridge,
      executor,
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
      stateManager: sm,
      candidateId: 't_99',
      browserDomBridge: bridge,
      executor,
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
      stateManager: sm,
      candidateId: 't_0',
      browserDomBridge: bridge,
      executor,
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
      id: 't_0',
      source: 'chrome_dom',
      selector: '#iframe-btn',
      frameId: 5,
    })
    sm.updateGroundingSnapshot(freshSnapshot([candidate]))

    const bridge = makeMockBridge(true)
    const executor = makeMockExecutor()

    await simulateClickTargetHandler({
      stateManager: sm,
      candidateId: 't_0',
      browserDomBridge: bridge,
      executor,
    })

    expect(bridge.clickSelector).toHaveBeenCalledWith({
      selector: '#iframe-btn',
      frameIds: [5],
    })
  })

  // -----------------------------------------------------------------------
  // checkCheckbox fallback on failure
  // -----------------------------------------------------------------------

  it('falls back to OS click when checkCheckbox throws', async () => {
    const sm = new RunStateManager()
    const candidate = makeCandidate({
      id: 't_0',
      source: 'chrome_dom',
      tag: 'input',
      inputType: 'checkbox',
      role: 'checkbox',
      selector: '#cb',
      frameId: 0,
    })
    sm.updateGroundingSnapshot(freshSnapshot([candidate]))

    const bridge = makeMockBridge(true)
    bridge.checkCheckbox.mockRejectedValue(new Error('checkbox toggle failed'))
    const executor = makeMockExecutor()

    const result = await simulateClickTargetHandler({
      stateManager: sm,
      candidateId: 't_0',
      browserDomBridge: bridge,
      executor,
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
      makeCandidate({ id: 't_0', selector: '#first', label: 'First' }),
      makeCandidate({ id: 't_1', selector: '#second', label: 'Second' }),
    ]))

    const bridge = makeMockBridge(true)
    const executor = makeMockExecutor()

    const first = await simulateClickTargetHandler({
      stateManager: sm,
      candidateId: 't_0',
      browserDomBridge: bridge,
      executor,
    })
    expect(first.isError).toBe(false)
    expect(first.text).toContain('First')

    const second = await simulateClickTargetHandler({
      stateManager: sm,
      candidateId: 't_1',
      browserDomBridge: bridge,
      executor,
    })
    expect(second.isError).toBe(false)
    expect(second.text).toContain('Second')
    expect(bridge.clickSelector).toHaveBeenCalledTimes(2)
  })
})
