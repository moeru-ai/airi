/**
 * Snap resolver — coordinate snap logic for desktop grounding.
 *
 * Resolves raw coordinates to the best matching target candidate
 * using the priority hierarchy: `chrome_dom > ax > vision > raw`.
 *
 * The resolver:
 * 1. Groups candidates by source tier
 * 2. Tries each tier in priority order
 * 3. Within each tier, finds the closest candidate whose bounds contain the point
 * 4. Falls through to the next tier if no match
 * 5. Returns raw point as fallback if nothing matches
 */

import type {
  DesktopGroundingSnapshot,
  DesktopTargetCandidate,
  SnapResolution,
  TargetSource,
} from './desktop-grounding-types'
import type { Bounds } from './types'

import { TARGET_SOURCE_PRIORITY } from './desktop-grounding-types'

/**
 * Maximum distance (in logical pixels) from a candidate's bounds edge
 * to still consider snapping to it. Beyond this, the point is "too far"
 * from any candidate and falls back to raw.
 */
const SNAP_PROXIMITY_THRESHOLD_PX = 20

/**
 * Options for snap resolution.
 */
export interface SnapResolverOptions {
  /** Override the proximity threshold for edge-snapping (default: 20px) */
  proximityThresholdPx?: number
  /** Only consider candidates from these sources */
  allowedSources?: TargetSource[]
}

/**
 * Resolve a raw point to the best matching target candidate.
 *
 * Priority: chrome_dom > ax > vision > raw.
 * Within each tier, prefers candidates whose bounds contain the point.
 * If no containment match, falls back to nearest-center within the
 * proximity threshold.
 *
 * @param point - The raw coordinate to resolve
 * @param snapshot - The current desktop grounding snapshot
 * @param options - Optional resolution parameters
 * @returns The snap resolution with matched candidate and reason
 */
export function resolveSnap(
  point: { x: number, y: number },
  snapshot: DesktopGroundingSnapshot,
  options: SnapResolverOptions = {},
): SnapResolution {
  const threshold = options.proximityThresholdPx ?? SNAP_PROXIMITY_THRESHOLD_PX
  const allowedSources = options.allowedSources ?? [...TARGET_SOURCE_PRIORITY]
  const candidates = snapshot.targetCandidates

  if (candidates.length === 0) {
    return {
      rawPoint: point,
      snappedPoint: point,
      source: 'none',
      reason: 'no candidates available; using raw point',
    }
  }

  // Try each source tier in priority order
  for (const source of TARGET_SOURCE_PRIORITY) {
    if (!allowedSources.includes(source)) {
      continue
    }

    const tierCandidates = candidates.filter(c => c.source === source && c.interactable)
    if (tierCandidates.length === 0) {
      continue
    }

    // 1. Direct containment: point is inside candidate bounds
    const containment = tierCandidates.filter(c => isPointInBounds(point, c.bounds))
    if (containment.length > 0) {
      // If multiple contain the point, pick the smallest (most specific)
      const best = containment.reduce((a, b) =>
        boundsArea(a.bounds) <= boundsArea(b.bounds) ? a : b,
      )
      const center = boundsCenter(best.bounds)
      return {
        rawPoint: point,
        snappedPoint: center,
        candidateId: best.id,
        source,
        reason: `point inside ${source} candidate "${best.label}" bounds; snapped to center`,
      }
    }

    // 2. Proximity: nearest candidate center within threshold
    const nearest = findNearestCandidate(point, tierCandidates, threshold)
    if (nearest) {
      const center = boundsCenter(nearest.bounds)
      return {
        rawPoint: point,
        snappedPoint: center,
        candidateId: nearest.id,
        source,
        reason: `point within ${threshold}px of ${source} candidate "${nearest.label}"; snapped to center`,
      }
    }
  }

  // No match in any tier → raw fallback
  return {
    rawPoint: point,
    snappedPoint: point,
    source: 'none',
    reason: `no candidate matched within ${threshold}px; using raw point`,
  }
}

/**
 * Resolve a snap by candidate ID directly (for `desktop_click_target`).
 *
 * Looks up the candidate by id, validates it exists and isn't stale,
 * and returns a snap to its center.
 *
 * @param candidateId - The candidate id from the snapshot
 * @param snapshot - The current desktop grounding snapshot
 * @returns The snap resolution, or an error result if invalid
 */
export function resolveSnapByCandidate(
  candidateId: string,
  snapshot: DesktopGroundingSnapshot,
): SnapResolution {
  const candidate = snapshot.targetCandidates.find(c => c.id === candidateId)

  if (!candidate) {
    return {
      rawPoint: { x: 0, y: 0 },
      snappedPoint: { x: 0, y: 0 },
      source: 'none',
      reason: `candidate "${candidateId}" not found in snapshot`,
    }
  }

  if (isStaleCandidateSource(candidate.source, snapshot)) {
    const center = boundsCenter(candidate.bounds)
    return {
      rawPoint: center,
      snappedPoint: center,
      candidateId,
      source: candidate.source,
      reason: `WARNING: candidate "${candidateId}" source "${candidate.source}" is stale; proceeding with last-known position`,
    }
  }

  const center = boundsCenter(candidate.bounds)
  return {
    rawPoint: center,
    snappedPoint: center,
    candidateId,
    source: candidate.source,
    reason: `direct candidate lookup; snapped to ${candidate.source} candidate "${candidate.label}" center`,
  }
}

/**
 * Check if a candidate's source is flagged as stale in the snapshot.
 */
export function isStaleCandidateSource(
  source: TargetSource,
  snapshot: DesktopGroundingSnapshot,
): boolean {
  switch (source) {
    case 'chrome_dom':
      return snapshot.staleFlags.chromeSemantic
    case 'ax':
      return snapshot.staleFlags.ax
    case 'vision':
      return snapshot.staleFlags.screenshot
    case 'raw':
      return false
  }
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Check if a point is inside a bounding rect. */
export function isPointInBounds(
  point: { x: number, y: number },
  bounds: Bounds,
): boolean {
  return (
    point.x >= bounds.x
    && point.x <= bounds.x + bounds.width
    && point.y >= bounds.y
    && point.y <= bounds.y + bounds.height
  )
}

/** Compute the center point of a bounding rect. */
export function boundsCenter(bounds: Bounds): { x: number, y: number } {
  return {
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2),
  }
}

/** Compute the area of a bounding rect. */
export function boundsArea(bounds: Bounds): number {
  return bounds.width * bounds.height
}

/** Euclidean distance between two points. */
export function pointDistance(
  a: { x: number, y: number },
  b: { x: number, y: number },
): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

/**
 * Compute the minimum distance from a point to any edge of a bounding rect.
 * Returns 0 if the point is inside the bounds.
 */
export function distanceToBounds(
  point: { x: number, y: number },
  bounds: Bounds,
): number {
  const dx = Math.max(bounds.x - point.x, 0, point.x - (bounds.x + bounds.width))
  const dy = Math.max(bounds.y - point.y, 0, point.y - (bounds.y + bounds.height))
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Compute the intersection-over-union (IoU) between two bounding rects.
 * Used for deduplication of candidates from different sources.
 */
export function boundsIoU(a: Bounds, b: Bounds): number {
  const ax2 = a.x + a.width
  const ay2 = a.y + a.height
  const bx2 = b.x + b.width
  const by2 = b.y + b.height

  const interX = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x))
  const interY = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y))
  const interArea = interX * interY

  if (interArea === 0)
    return 0

  const aArea = a.width * a.height
  const bArea = b.width * b.height
  return interArea / (aArea + bArea - interArea)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Find the nearest candidate to a point within a distance threshold.
 * Uses distance-to-bounds-edge as metric, not center distance.
 */
function findNearestCandidate(
  point: { x: number, y: number },
  candidates: DesktopTargetCandidate[],
  threshold: number,
): DesktopTargetCandidate | undefined {
  let best: DesktopTargetCandidate | undefined
  let bestDist = Infinity

  for (const candidate of candidates) {
    const dist = distanceToBounds(point, candidate.bounds)
    if (dist <= threshold && dist < bestDist) {
      best = candidate
      bestDist = dist
    }
  }

  return best
}
