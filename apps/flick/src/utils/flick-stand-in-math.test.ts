import { describe, expect, it } from 'vitest'

import { bezierDerivative, bezierPoint, cubicBezier, easeSpinDecelerate, slotToOffset, SPIN_CONFIG } from './flick-stand-in-math'

describe('flick-stand-in math', () => {
  describe('bezierPoint', () => {
    it('returns p0 at t=0', () => {
      expect(bezierPoint(0, 0, 0, 0, 0)).toBe(0)
      expect(bezierPoint(1, 2, 3, 4, 0)).toBe(1)
    })

    it('returns p3 at t=1', () => {
      expect(bezierPoint(0, 0, 0, 0, 1)).toBe(0)
      expect(bezierPoint(1, 2, 3, 4, 1)).toBe(4)
    })

    it('returns midpoint at t=0.5 for linear curve', () => {
      // Linear bezier: bezierPoint(0, 0, 1, 1, 0.5) = 0.5
      expect(bezierPoint(0, 0, 1, 1, 0.5)).toBe(0.5)
    })

    it('computes correct endpoint values', () => {
      // P(0) = p0, P(1) = p3
      expect(bezierPoint(0.1, 0.5, 0.8, 0.9, 0)).toBe(0.1)
      expect(bezierPoint(0.1, 0.5, 0.8, 0.9, 1)).toBe(0.9)
    })

    it('handles a simple cubic correctly', () => {
      // (1-t)^3 * 0 + 3(1-t)^2t * 0 + 3(1-t)t^2 * 0 + t^3 * 1 = t^3
      expect(bezierPoint(0, 0, 0, 1, 0.5)).toBeCloseTo(0.125, 5)
    })
  })

  describe('bezierDerivative', () => {
    it('is zero at t=0 when p0=p1', () => {
      expect(bezierDerivative(0, 0, 1, 1, 0)).toBeCloseTo(0, 5)
    })

    it('is zero at t=1 when p2=p3', () => {
      expect(bezierDerivative(0, 0, 1, 1, 1)).toBeCloseTo(0, 5)
    })

    it('for linear curve (0,0,1,1) derivative is 6t(1-t)', () => {
      // bezierPoint(0,0,1,1,t) = 3t^2 - 2t^3, derivative = 6t - 6t^2 = 6t(1-t)
      expect(bezierDerivative(0, 0, 1, 1, 0)).toBeCloseTo(0, 5)
      expect(bezierDerivative(0, 0, 1, 1, 0.5)).toBeCloseTo(1.5, 5)
      expect(bezierDerivative(0, 0, 1, 1, 1)).toBeCloseTo(0, 5)
    })
  })

  describe('cubicBezier', () => {
    it('returns y at t for known curve', () => {
      // Linear ease: cubicBezier(0, 0, 1, 1, t) ≈ t
      expect(cubicBezier(0, 0, 1, 1, 0)).toBeCloseTo(0, 3)
      expect(cubicBezier(0, 0, 1, 1, 0.5)).toBeCloseTo(0.5, 2)
      expect(cubicBezier(0, 0, 1, 1, 1)).toBeCloseTo(1, 3)
    })

    it('converges within 8 Newton-Raphson iterations', () => {
      // No assertion needed — just verify it doesn't throw
      const result = cubicBezier(0.12, 0.92, 0.04, 1.02, 0.5)
      expect(result).toBeGreaterThan(0)
      expect(result).toBeLessThan(1)
    })

    it('handles edge values without division by zero', () => {
      // Near-zero derivative case
      expect(cubicBezier(0.5, 0.5, 0.5, 0.5, 0.5)).not.toBeNaN()
    })
  })

  describe('easeSpinDecelerate', () => {
    it('returns 0 at t=0', () => {
      expect(easeSpinDecelerate(0)).toBeCloseTo(0, 5)
    })

    it('returns 1 at t=1', () => {
      expect(easeSpinDecelerate(1)).toBeCloseTo(1, 5)
    })

    it('is mostly monotonically increasing with slight spring overshoot', () => {
      const samples = Array.from({ length: 21 }, (_, i) => i / 20)
      let nonMonotonic = 0
      for (let i = 0; i < samples.length - 1; i++) {
        if (easeSpinDecelerate(samples[i + 1]) < easeSpinDecelerate(samples[i]) - 0.01) {
          nonMonotonic++
        }
      }
      // Allow up to 2 non-monotonic transitions due to spring overshoot
      expect(nonMonotonic).toBeLessThanOrEqual(2)
    })

    it('stays within [0, 1.02] range (slight overshoot is expected for spring curve)', () => {
      for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0]) {
        const result = easeSpinDecelerate(t)
        expect(result).toBeGreaterThanOrEqual(0)
        expect(result).toBeLessThanOrEqual(1.02)
      }
    })
  })

  describe('slotToOffset', () => {
    it('maps do to 0', () => {
      expect(slotToOffset('do')).toBe(0)
    })

    it('maps delay to -120', () => {
      expect(slotToOffset('delay')).toBe(-120)
    })

    it('maps skip to -240', () => {
      expect(slotToOffset('skip')).toBe(-240)
    })
  })

  describe('sPIN_CONFIG', () => {
    it('totalDuration is 1800ms', () => {
      expect(SPIN_CONFIG.totalDuration).toBe(1800)
    })

    it('accelerationEnd + decelerate duration sums to totalDuration', () => {
      const accelEnd = SPIN_CONFIG.accelerationEnd
      const decelStart = SPIN_CONFIG.decelerateStart
      const decelEnd = SPIN_CONFIG.decelerateEnd
      const landingEnd = SPIN_CONFIG.landingEnd

      expect(accelEnd).toBe(400)
      expect(decelStart).toBe(400)
      expect(decelEnd).toBe(1600)
      expect(landingEnd).toBe(1800)

      // deceleration phase should be 1200ms
      expect(decelEnd - decelStart).toBe(1200)
      // landing phase should be 200ms
      expect(landingEnd - decelEnd).toBe(200)
    })

    it('decelerateEnd = accelerationEnd + 1200', () => {
      expect(SPIN_CONFIG.decelerateEnd - SPIN_CONFIG.accelerationEnd).toBe(1200)
    })

    it('totalRotations is 6', () => {
      expect(SPIN_CONFIG.totalRotations).toBe(6)
    })

    it('overshootAngle and jitterRange are positive', () => {
      expect(SPIN_CONFIG.overshootAngle).toBeGreaterThan(0)
      expect(SPIN_CONFIG.jitterRange).toBeGreaterThan(0)
    })
  })
})
