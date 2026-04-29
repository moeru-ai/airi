import { describe, expect, it } from 'vitest'

import {
  getByLane,
  getLaneHappyPath,
  getProductSupported,
  strictReleaseGateCommands,
  supportMatrix,
  validateProductSupported,
  validateProductSupportedStrictGates,
} from './support-matrix'

describe('support matrix', () => {
  it('has at least one entry per lane', () => {
    const lanes = ['workflow', 'browser', 'desktop-native', 'handoff', 'terminal'] as const
    for (const lane of lanes) {
      expect(getByLane(lane).length, `lane "${lane}" must have entries`).toBeGreaterThan(0)
    }
  })

  it('all product-supported entries satisfy the verification triple', () => {
    const failures = validateProductSupported()
    if (failures.length > 0) {
      const ids = failures.map(entry => entry.id).join(', ')
      throw new Error(`product-supported entries missing unitTests/smokeCommand/happyPath: ${ids}`)
    }
  })

  it('all product-supported entries point at a strict release gate', () => {
    const failures = validateProductSupportedStrictGates()
    if (failures.length > 0) {
      const ids = failures.map(entry => entry.id).join(', ')
      const gates = strictReleaseGateCommands.join(', ')
      throw new Error(`product-supported entries must use a strict release gate (${gates}); failing ids: ${ids}`)
    }
  })

  it('every entry has a unique id', () => {
    const ids = supportMatrix.map(entry => entry.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('each lane has exactly one representative happy path', () => {
    const lanes = ['workflow', 'browser', 'desktop-native', 'handoff', 'terminal'] as const
    for (const lane of lanes) {
      const happyPathEntry = getLaneHappyPath(lane)
      expect(happyPathEntry, `lane "${lane}" must have a happy path`).toBeDefined()
    }
  })

  it('product-supported count is reasonable', () => {
    const ps = getProductSupported()
    expect(ps.length).toBeGreaterThanOrEqual(4)
  })
})
