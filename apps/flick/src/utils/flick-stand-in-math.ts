import type { DecisionOptionId } from './flick-engine'

// ─── Spin animation configuration (per motion spec) ───────────────────────────

export const SPIN_CONFIG = {
  totalDuration: 1800,
  accelerationEnd: 400,
  decelerateStart: 400,
  decelerateEnd: 1600,
  landingStart: 1600,
  landingEnd: 1800,
  totalRotations: 6,
  overshootAngle: 6,
  jitterRange: 9,
} as const

// ─── Cubic bezier math ───────────────────────────────────────────────────────

export function cubicBezier(x1: number, y1: number, x2: number, y2: number, t: number): number {
  const epsilon = 1e-6
  let guess = t

  for (let i = 0; i < 8; i++) {
    const currentX = bezierPoint(0, x1, x2, 1, guess)
    const derivative = bezierDerivative(0, x1, x2, 1, guess)
    if (Math.abs(derivative) < epsilon)
      break
    guess = guess - (currentX - t) / derivative
  }

  return bezierPoint(0, y1, y2, 1, guess)
}

export function bezierPoint(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3
}

export function bezierDerivative(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t
  return 3 * mt * mt * (p1 - p0) + 6 * mt * t * (p2 - p1) + 3 * t * t * (p3 - p2)
}

// ─── Custom deceleration easing: cubic-bezier(0.12, 0.92, 0.04, 1.02) ────────

export function easeSpinDecelerate(t: number): number {
  const c1 = 0.12
  const c2 = 0.92
  const c3 = 0.04
  const c4 = 1.02

  return cubicBezier(c1, c2, c3, c4, t)
}

// ─── Slot to angle offset ────────────────────────────────────────────────────

export function slotToOffset(slot: DecisionOptionId): number {
  switch (slot) {
    case 'do':
      return 0
    case 'delay':
      return -120
    case 'skip':
      return -240
    default:
      return 0
  }
}
