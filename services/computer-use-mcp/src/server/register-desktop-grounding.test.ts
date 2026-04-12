import type {
  DesktopGroundingSnapshot,
  DesktopTargetCandidate,
  TargetSource,
} from '../desktop-grounding-types'

import { describe, expect, it } from 'vitest'

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
