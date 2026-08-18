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
    snapshotId: 'test_1',
    capturedAt: new Date().toISOString(),
    foregroundApp: 'Google Chrome',
    windows: [],
    screenshot: { dataBase64: '', mimeType: 'image/png', path: '' },
    targetCandidates: candidates.map((c, i) => ({
      id: c.id ?? `t_${i}`,
      source: c.source ?? 'ax',
      appName: c.appName ?? 'Google Chrome',
      role: c.role ?? 'AXButton',
      label: c.label ?? `Button ${i}`,
      bounds: c.bounds ?? { x: 100, y: 100, width: 50, height: 30 },
      confidence: c.confidence ?? 0.8,
      interactable: c.interactable ?? true,
    })),
    staleFlags: {
      screenshot: false,
      ax: false,
      chromeSemantic: false,
      ...staleFlags,
    },
  } as DesktopGroundingSnapshot
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

describe('geometry helpers', () => {
  it('isPointInBounds: point inside', () => {
    expect(isPointInBounds({ x: 125, y: 115 }, { x: 100, y: 100, width: 50, height: 30 })).toBe(true)
  })

  it('isPointInBounds: point on edge', () => {
    expect(isPointInBounds({ x: 100, y: 100 }, { x: 100, y: 100, width: 50, height: 30 })).toBe(true)
    expect(isPointInBounds({ x: 150, y: 130 }, { x: 100, y: 100, width: 50, height: 30 })).toBe(true)
  })

  it('isPointInBounds: point outside', () => {
    expect(isPointInBounds({ x: 99, y: 115 }, { x: 100, y: 100, width: 50, height: 30 })).toBe(false)
    expect(isPointInBounds({ x: 151, y: 115 }, { x: 100, y: 100, width: 50, height: 30 })).toBe(false)
  })

  it('boundsCenter computes center', () => {
    expect(boundsCenter({ x: 100, y: 200, width: 50, height: 30 })).toEqual({ x: 125, y: 215 })
  })

  it('boundsArea computes area', () => {
    expect(boundsArea({ x: 0, y: 0, width: 10, height: 20 })).toBe(200)
  })

  it('pointDistance computes euclidean distance', () => {
    expect(pointDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })

  it('distanceToBounds: inside → 0', () => {
    expect(distanceToBounds({ x: 125, y: 115 }, { x: 100, y: 100, width: 50, height: 30 })).toBe(0)
  })

  it('distanceToBounds: outside → positive', () => {
    // 10px to the left of bounds
    expect(distanceToBounds({ x: 90, y: 115 }, { x: 100, y: 100, width: 50, height: 30 })).toBe(10)
  })

  it('boundsIoU: identical → 1', () => {
    const b = { x: 0, y: 0, width: 100, height: 100 }
    expect(boundsIoU(b, b)).toBe(1)
  })

  it('boundsIoU: no overlap → 0', () => {
    expect(boundsIoU(
      { x: 0, y: 0, width: 50, height: 50 },
      { x: 200, y: 200, width: 50, height: 50 },
    )).toBe(0)
  })

  it('boundsIoU: partial overlap', () => {
    const iou = boundsIoU(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 50, y: 50, width: 100, height: 100 },
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
        source: 'ax',
        bounds: { x: 100, y: 100, width: 50, height: 30 },
        label: 'OK Button',
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
        { source: 'ax', bounds: { x: 100, y: 100, width: 50, height: 30 }, label: 'AX' },
        { source: 'chrome_dom', bounds: { x: 105, y: 105, width: 40, height: 20 }, label: 'Chrome' },
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
        { source: 'ax', bounds: { x: 50, y: 50, width: 200, height: 200 }, label: 'Big' },
        { source: 'ax', bounds: { x: 110, y: 110, width: 30, height: 20 }, label: 'Small' },
      ]),
    )
    expect(snap.candidateId).toBe('t_1')
    expect(snap.reason).toContain('Small')
  })

  it('proximity fallback: near but not inside', () => {
    const snap = resolveSnap(
      { x: 155, y: 115 },
      makeSnapshot([{
        source: 'ax',
        bounds: { x: 100, y: 100, width: 50, height: 30 },
        label: 'Near',
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
        source: 'ax',
        bounds: { x: 100, y: 100, width: 50, height: 30 },
        label: 'Far Away',
      }]),
    )
    expect(snap.source).toBe('none')
    expect(snap.snappedPoint).toEqual({ x: 500, y: 500 })
  })

  it('non-interactable candidates are skipped', () => {
    const snap = resolveSnap(
      { x: 110, y: 110 },
      makeSnapshot([{
        source: 'ax',
        bounds: { x: 100, y: 100, width: 50, height: 30 },
        label: 'Disabled',
        interactable: false,
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
        bounds: { x: 100, y: 100, width: 50, height: 30 },
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
        [{ source: 'chrome_dom', label: 'Stale' }],
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
  const staleSnapshot = makeSnapshot([], { chromeSemantic: true, ax: true })

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
