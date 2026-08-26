import type { DesktopGroundingSnapshot, DesktopTargetCandidate } from './desktop-grounding-types'

import { describe, expect, it } from 'vitest'

import {
  boundsArea,
  boundsCenter,
  boundsIoU,
  distanceToBounds,
  isPointInBounds,
  isStaleCandidateSource,
  pointDistance,
  resolveSnap,
  resolveSnapByCandidate,
} from './snap-resolver'

// ---------------------------------------------------------------------------
// Helper: minimal snapshot factory
// ---------------------------------------------------------------------------

function makeSnapshot(
  candidates: Partial<DesktopTargetCandidate>[],
  staleFlags?: Partial<DesktopGroundingSnapshot['staleFlags']>,
): DesktopGroundingSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    foregroundApp: 'Google Chrome',
    screenshot: { dataBase64: '', mimeType: 'image/png', path: '' },
    snapshotId: 'test_1',
    staleFlags: {
      ax: false,
      chromeSemantic: false,
      screenshot: false,
      ...staleFlags,
    },
    targetCandidates: candidates.map((c, i) => ({
      appName: c.appName ?? 'Google Chrome',
      bounds: c.bounds ?? { height: 30, width: 50, x: 100, y: 100 },
      confidence: c.confidence ?? 0.8,
      id: c.id ?? `t_${i}`,
      interactable: c.interactable ?? true,
      label: c.label ?? `Button ${i}`,
      role: c.role ?? 'AXButton',
      source: c.source ?? 'ax',
    })),
    windows: [],
  } as DesktopGroundingSnapshot
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

describe('geometry helpers', () => {
  it('isPointInBounds: point inside', () => {
    expect(isPointInBounds({ x: 125, y: 115 }, { height: 30, width: 50, x: 100, y: 100 })).toBe(true)
  })

  it('isPointInBounds: point on edge', () => {
    expect(isPointInBounds({ x: 100, y: 100 }, { height: 30, width: 50, x: 100, y: 100 })).toBe(true)
    expect(isPointInBounds({ x: 150, y: 130 }, { height: 30, width: 50, x: 100, y: 100 })).toBe(true)
  })

  it('isPointInBounds: point outside', () => {
    expect(isPointInBounds({ x: 99, y: 115 }, { height: 30, width: 50, x: 100, y: 100 })).toBe(false)
    expect(isPointInBounds({ x: 151, y: 115 }, { height: 30, width: 50, x: 100, y: 100 })).toBe(false)
  })

  it('boundsCenter computes center', () => {
    expect(boundsCenter({ height: 30, width: 50, x: 100, y: 200 })).toEqual({ x: 125, y: 215 })
  })

  it('boundsArea computes area', () => {
    expect(boundsArea({ height: 20, width: 10, x: 0, y: 0 })).toBe(200)
  })

  it('pointDistance computes euclidean distance', () => {
    expect(pointDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })

  it('distanceToBounds: inside → 0', () => {
    expect(distanceToBounds({ x: 125, y: 115 }, { height: 30, width: 50, x: 100, y: 100 })).toBe(0)
  })

  it('distanceToBounds: outside → positive', () => {
    // 10px to the left of bounds
    expect(distanceToBounds({ x: 90, y: 115 }, { height: 30, width: 50, x: 100, y: 100 })).toBe(10)
  })

  it('boundsIoU: identical → 1', () => {
    const b = { height: 100, width: 100, x: 0, y: 0 }
    expect(boundsIoU(b, b)).toBe(1)
  })

  it('boundsIoU: no overlap → 0', () => {
    expect(boundsIoU(
      { height: 50, width: 50, x: 0, y: 0 },
      { height: 50, width: 50, x: 200, y: 200 },
    )).toBe(0)
  })

  it('boundsIoU: partial overlap', () => {
    const iou = boundsIoU(
      { height: 100, width: 100, x: 0, y: 0 },
      { height: 100, width: 100, x: 50, y: 50 },
    )
    // Intersection: 50x50 = 2500, Union: 10000 + 10000 - 2500 = 17500
    expect(iou).toBeCloseTo(2500 / 17500, 3)
  })
})

// ---------------------------------------------------------------------------
// resolveSnap — priority and matching
// ---------------------------------------------------------------------------

describe('resolveSnap', () => {
  it('empty candidates → raw point fallback', () => {
    const snap = resolveSnap({ x: 100, y: 100 }, makeSnapshot([]))
    expect(snap.source).toBe('none')
    expect(snap.snappedPoint).toEqual({ x: 100, y: 100 })
    expect(snap.reason).toContain('no candidates')
  })

  it('point inside ax candidate → snaps to center', () => {
    const snap = resolveSnap(
      { x: 110, y: 110 },
      makeSnapshot([{
        bounds: { height: 30, width: 50, x: 100, y: 100 },
        label: 'OK Button',
        source: 'ax',
      }]),
    )
    expect(snap.source).toBe('ax')
    expect(snap.candidateId).toBe('t_0')
    expect(snap.snappedPoint).toEqual({ x: 125, y: 115 })
    expect(snap.reason).toContain('OK Button')
  })

  it('chrome_dom beats ax when both contain point', () => {
    const snap = resolveSnap(
      { x: 110, y: 110 },
      makeSnapshot([
        { bounds: { height: 30, width: 50, x: 100, y: 100 }, label: 'AX', source: 'ax' },
        { bounds: { height: 20, width: 40, x: 105, y: 105 }, label: 'Chrome', source: 'chrome_dom' },
      ]),
    )
    expect(snap.source).toBe('chrome_dom')
    expect(snap.candidateId).toBe('t_1')
    expect(snap.reason).toContain('Chrome')
  })

  it('prefers smallest containing candidate within same tier', () => {
    const snap = resolveSnap(
      { x: 120, y: 115 },
      makeSnapshot([
        { bounds: { height: 200, width: 200, x: 50, y: 50 }, label: 'Big', source: 'ax' },
        { bounds: { height: 20, width: 30, x: 110, y: 110 }, label: 'Small', source: 'ax' },
      ]),
    )
    expect(snap.candidateId).toBe('t_1')
    expect(snap.reason).toContain('Small')
  })

  it('proximity fallback: near but not inside', () => {
    const snap = resolveSnap(
      { x: 155, y: 115 },
      makeSnapshot([{
        bounds: { height: 30, width: 50, x: 100, y: 100 },
        label: 'Near',
        source: 'ax',
      }]),
    )
    // 155 is 5px to the right of bounds edge (150)
    expect(snap.source).toBe('ax')
    expect(snap.candidateId).toBe('t_0')
    expect(snap.reason).toContain('within')
  })

  it('too far from any candidate → raw fallback', () => {
    const snap = resolveSnap(
      { x: 500, y: 500 },
      makeSnapshot([{
        bounds: { height: 30, width: 50, x: 100, y: 100 },
        label: 'Far Away',
        source: 'ax',
      }]),
    )
    expect(snap.source).toBe('none')
    expect(snap.snappedPoint).toEqual({ x: 500, y: 500 })
  })

  it('non-interactable candidates are skipped', () => {
    const snap = resolveSnap(
      { x: 110, y: 110 },
      makeSnapshot([{
        bounds: { height: 30, width: 50, x: 100, y: 100 },
        interactable: false,
        label: 'Disabled',
        source: 'ax',
      }]),
    )
    expect(snap.source).toBe('none')
  })
})

// ---------------------------------------------------------------------------
// resolveSnapByCandidate
// ---------------------------------------------------------------------------

describe('resolveSnapByCandidate', () => {
  it('valid candidate → snaps to center', () => {
    const snap = resolveSnapByCandidate(
      't_0',
      makeSnapshot([{
        bounds: { height: 30, width: 50, x: 100, y: 100 },
        label: 'My Button',
      }]),
    )
    expect(snap.candidateId).toBe('t_0')
    expect(snap.snappedPoint).toEqual({ x: 125, y: 115 })
    expect(snap.source).toBe('ax')
    expect(snap.reason).toContain('My Button')
  })

  it('missing candidate → error result', () => {
    const snap = resolveSnapByCandidate('t_99', makeSnapshot([]))
    expect(snap.source).toBe('none')
    expect(snap.reason).toContain('not found')
  })

  it('stale candidate source → warning in reason', () => {
    const snap = resolveSnapByCandidate(
      't_0',
      makeSnapshot(
        [{ label: 'Stale', source: 'chrome_dom' }],
        { chromeSemantic: true },
      ),
    )
    expect(snap.reason).toContain('stale')
  })
})

// ---------------------------------------------------------------------------
// isStaleCandidateSource
// ---------------------------------------------------------------------------

describe('isStaleCandidateSource', () => {
  const freshSnapshot = makeSnapshot([])
  const staleSnapshot = makeSnapshot([], { ax: true, chromeSemantic: true })

  it('chrome_dom → checks chromeSemantic flag', () => {
    expect(isStaleCandidateSource('chrome_dom', freshSnapshot)).toBe(false)
    expect(isStaleCandidateSource('chrome_dom', staleSnapshot)).toBe(true)
  })

  it('ax → checks ax flag', () => {
    expect(isStaleCandidateSource('ax', freshSnapshot)).toBe(false)
    expect(isStaleCandidateSource('ax', staleSnapshot)).toBe(true)
  })

  it('raw → never stale', () => {
    expect(isStaleCandidateSource('raw', staleSnapshot)).toBe(false)
  })
})
