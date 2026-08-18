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

  it('includes desktop v3 smoke coverage as covered, not product-supported', () => {
    const entry = supportMatrix.find(item => item.id === 'desktop_v3_chrome_grounding')
    expect(entry).toBeDefined()
    expect(entry?.lane).toBe('desktop-native')
    expect(entry?.level).toBe('covered')
    expect(entry?.smokeCommand).toBe('pnpm -F @proj-airi/computer-use-mcp smoke:desktop-v3')
  })

  it('includes browser-dom route contract as covered, not product-supported', () => {
    const entry = supportMatrix.find(item => item.id === 'desktop_browser_dom_route_contract')
    expect(entry).toBeDefined()
    expect(entry?.lane).toBe('desktop-native')
    expect(entry?.level).toBe('covered')
    expect(entry?.unitTests).toEqual([
      'src/browser-action-router.test.ts',
      'src/browser-dom/extension-bridge.test.ts',
    ])
  })
})
