import type { DesktopTargetCandidate } from './desktop-grounding-types'

import { describe, expect, it } from 'vitest'

import { decideBrowserAction } from './browser-action-router'

function makeCandidate(overrides: Partial<DesktopTargetCandidate> = {}): DesktopTargetCandidate {
  return {
    id: 't_0',
    source: 'chrome_dom',
    appName: 'Google Chrome',
    role: 'button',
    label: 'Submit',
    bounds: { x: 100, y: 200, width: 80, height: 30 },
    confidence: 0.95,
    interactable: true,
    selector: '#submit-btn',
    frameId: 0,
    isPageContent: true,
    ...overrides,
  }
}

describe('decideBrowserAction', () => {
  it('routes chrome_dom with selector + bridge available to browser_dom', () => {
    const decision = decideBrowserAction(makeCandidate(), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.selector).toBe('#submit-btn')
    expect(decision.frameId).toBe(0)
  })

  it('falls back to os_input when source is ax', () => {
    const decision = decideBrowserAction(makeCandidate({ source: 'ax' }), true)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('ax')
  })

  it('falls back to os_input when source is vision', () => {
    const decision = decideBrowserAction(makeCandidate({ source: 'vision' }), true)
    expect(decision.route).toBe('os_input')
  })

  it('falls back to os_input when selector is missing', () => {
    const decision = decideBrowserAction(makeCandidate({ selector: undefined }), true)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('no CSS selector')
  })

  it('falls back to os_input when bridge is unavailable', () => {
    const decision = decideBrowserAction(makeCandidate(), false)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('not connected')
  })

  it('preserves non-zero frameId for sub-frame candidates', () => {
    const decision = decideBrowserAction(makeCandidate({ frameId: 3 }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.frameId).toBe(3)
  })

  it('falls back to os_input when selector is empty string', () => {
    const decision = decideBrowserAction(makeCandidate({ selector: '' }), true)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('no CSS selector')
  })
})
