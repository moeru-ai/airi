import { describe, expect, it, vi } from 'vitest'

import { decideBrowserAction, decideBrowserTypeAction } from './browser-action-router'
import { captureChromeSemantics, chromeElementsToTargetCandidates } from './chrome-semantic-adapter'

// ---------------------------------------------------------------------------
// chromeElementsToTargetCandidates
// ---------------------------------------------------------------------------

describe('chromeElementsToTargetCandidates', () => {
  const windowBounds = { height: 800, width: 1200, x: 100, y: 50 }

  it('transforms page-relative rects to screen-absolute', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{
        rect: { h: 30, w: 80, x: 10, y: 20 },
        tag: 'button',
        text: 'Submit',
      }],
      windowBounds,
    )

    expect(candidates).toHaveLength(1)
    const c = candidates[0]
    // x = windowBounds.x + rect.x = 100 + 10 = 110
    // y = windowBounds.y + chromeHeight(88) + rect.y = 50 + 88 + 20 = 158
    expect(c.bounds.x).toBe(110)
    expect(c.bounds.y).toBe(158)
    expect(c.bounds.width).toBe(80)
    expect(c.bounds.height).toBe(30)
  })

  it('allows custom chrome height', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ rect: { h: 20, w: 50, x: 0, y: 0 }, tag: 'button', text: 'A' }],
      windowBounds,
      100, // custom chrome height
    )
    expect(candidates[0].bounds.y).toBe(50 + 100 + 0)
  })

  it('skips elements with zero-size rects', () => {
    const candidates = chromeElementsToTargetCandidates(
      [
        { rect: { h: 0, w: 0, x: 0, y: 0 }, tag: 'button', text: 'Zero' },
        { rect: { h: 20, w: 50, x: 10, y: 10 }, tag: 'button', text: 'Valid' },
      ],
      windowBounds,
    )
    expect(candidates).toHaveLength(1)
    expect(candidates[0].label).toBe('Valid')
  })

  it('skips elements without rects', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'button', text: 'No rect' }],
      windowBounds,
    )
    expect(candidates).toHaveLength(0)
  })

  it('skips elements outside window bounds', () => {
    const candidates = chromeElementsToTargetCandidates(
      [
        // Element far below the window
        { rect: { h: 20, w: 50, x: 10, y: 2000 }, tag: 'button', text: 'Below' },
        { rect: { h: 20, w: 50, x: 10, y: 10 }, tag: 'button', text: 'Inside' },
      ],
      windowBounds,
    )
    expect(candidates).toHaveLength(1)
    expect(candidates[0].label).toBe('Inside')
  })

  it('sets source to chrome_dom', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ rect: { h: 16, w: 40, x: 0, y: 0 }, tag: 'a', text: 'Link' }],
      windowBounds,
    )
    expect(candidates[0].source).toBe('chrome_dom')
  })

  it('buttons get high confidence', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ rect: { h: 20, w: 50, x: 0, y: 0 }, tag: 'button', text: 'Go' }],
      windowBounds,
    )
    expect(candidates[0].confidence).toBe(0.95)
  })

  it('disabled elements get low confidence', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ disabled: true, rect: { h: 20, w: 50, x: 0, y: 0 }, tag: 'button', text: 'Disabled' }],
      windowBounds,
    )
    expect(candidates[0].confidence).toBe(0.3)
    expect(candidates[0].interactable).toBe(false)
  })

  it('builds label from text, placeholder, name, id, href', () => {
    const textLabel = chromeElementsToTargetCandidates(
      [{ rect: { h: 20, w: 50, x: 0, y: 0 }, tag: 'button', text: 'Click me' }],
      windowBounds,
    )
    expect(textLabel[0].label).toBe('Click me')

    const placeholderLabel = chromeElementsToTargetCandidates(
      [{ placeholder: 'Enter name', rect: { h: 20, w: 50, x: 0, y: 0 }, tag: 'input' }],
      windowBounds,
    )
    expect(placeholderLabel[0].label).toBe('[Enter name]')

    const idLabel = chromeElementsToTargetCandidates(
      [{ id: 'main-cta', rect: { h: 20, w: 50, x: 0, y: 0 }, tag: 'div' }],
      windowBounds,
    )
    expect(idLabel[0].label).toBe('#main-cta')
  })

  // -----------------------------------------------------------------------
  // Selector building (v2)
  // -----------------------------------------------------------------------

  it('builds selector from element id (highest priority)', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ id: 'submit-btn', rect: { h: 20, w: 50, x: 0, y: 0 }, tag: 'button', text: 'Go' }],
      windowBounds,
    )
    expect(candidates[0].selector).toBe('#submit-btn')
  })

  it('escapes special characters in id selectors', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ id: 'my.element:1', rect: { h: 20, w: 50, x: 0, y: 0 }, tag: 'div' }],
      windowBounds,
    )
    // dots and colons must be escaped
    expect(candidates[0].selector).toBe('#my\\.element\\:1')
  })

  it('builds selector from name attribute (second priority)', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ name: 'email', rect: { h: 20, w: 100, x: 0, y: 0 }, tag: 'input' }],
      windowBounds,
    )
    expect(candidates[0].selector).toBe('input[name="email"]')
  })

  it('escapes quotes in name attribute selectors', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ name: 'field"evil', rect: { h: 20, w: 100, x: 0, y: 0 }, tag: 'input' }],
      windowBounds,
    )
    expect(candidates[0].selector).toBe('input[name="field\\"evil"]')
  })

  it('builds selector from tag+type for input elements (third priority)', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ rect: { h: 30, w: 80, x: 0, y: 0 }, tag: 'input', type: 'submit' }],
      windowBounds,
    )
    expect(candidates[0].selector).toBe('input[type="submit"]')
  })

  it('builds selector from tag+type for button elements', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ rect: { h: 30, w: 80, x: 0, y: 0 }, tag: 'button', type: 'submit' }],
      windowBounds,
    )
    expect(candidates[0].selector).toBe('button[type="submit"]')
  })

  it('does not use tag+type for non-input/button elements', () => {
    // A <div> with type attr should NOT get a tag[type=...] selector
    const candidates = chromeElementsToTargetCandidates(
      [{ className: 'widget', rect: { h: 30, w: 80, x: 0, y: 0 }, tag: 'div', type: 'custom' }],
      windowBounds,
    )
    // Should fall through to className-based selector
    expect(candidates[0].selector).toBe('div.widget')
  })

  it('builds selector from first className (fourth priority)', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ className: 'nav-link primary', rect: { h: 16, w: 60, x: 0, y: 0 }, tag: 'a' }],
      windowBounds,
    )
    expect(candidates[0].selector).toBe('a.nav-link')
  })

  it('returns undefined selector when no identifying attribute exists', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ rect: { h: 14, w: 40, x: 0, y: 0 }, tag: 'span', text: 'orphan' }],
      windowBounds,
    )
    expect(candidates[0].selector).toBeUndefined()
  })

  it('prefers id over name over type over className', () => {
    // Element with all attributes — id should win
    const candidates = chromeElementsToTargetCandidates(
      [{
        className: 'form-control',
        id: 'email-input',
        name: 'email',
        rect: { h: 30, w: 200, x: 0, y: 0 },
        tag: 'input',
        type: 'text',
      }],
      windowBounds,
    )
    expect(candidates[0].selector).toBe('#email-input')
  })

  it('falls through to name when id is empty/whitespace', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ id: '  ', name: 'username', rect: { h: 30, w: 200, x: 0, y: 0 }, tag: 'input' }],
      windowBounds,
    )
    expect(candidates[0].selector).toBe('input[name="username"]')
  })

  // -----------------------------------------------------------------------
  // Metadata enrichment (v2): isPageContent, enabled, inputType
  // -----------------------------------------------------------------------

  it('sets isPageContent=true for all chrome_dom candidates', () => {
    const candidates = chromeElementsToTargetCandidates(
      [
        { rect: { h: 20, w: 50, x: 0, y: 0 }, tag: 'button', text: 'A' },
        { rect: { h: 30, w: 200, x: 0, y: 30 }, tag: 'input', type: 'text' },
        { href: '/about', rect: { h: 16, w: 40, x: 0, y: 70 }, tag: 'a', text: 'About' },
      ],
      windowBounds,
    )
    for (const c of candidates) {
      expect(c.isPageContent).toBe(true)
    }
  })

  it('sets enabled=true for non-disabled elements', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ rect: { h: 20, w: 50, x: 0, y: 0 }, tag: 'button', text: 'Active' }],
      windowBounds,
    )
    expect(candidates[0].enabled).toBe(true)
  })

  it('sets enabled=false for disabled elements', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ disabled: true, rect: { h: 20, w: 50, x: 0, y: 0 }, tag: 'button', text: 'Nope' }],
      windowBounds,
    )
    expect(candidates[0].enabled).toBe(false)
    expect(candidates[0].interactable).toBe(false)
  })

  it('carries inputType from element type attribute', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ rect: { h: 30, w: 200, x: 0, y: 0 }, tag: 'input', type: 'password' }],
      windowBounds,
    )
    expect(candidates[0].inputType).toBe('password')
  })

  it('carries href for link elements', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ href: 'https://example.com', rect: { h: 16, w: 40, x: 0, y: 0 }, tag: 'a', text: 'Link' }],
      windowBounds,
    )
    expect(candidates[0].href).toBe('https://example.com')
  })

  // -----------------------------------------------------------------------
  // Frame ID propagation (v2)
  // -----------------------------------------------------------------------

  it('uses default frameId=0 when not specified', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ rect: { h: 20, w: 50, x: 0, y: 0 }, tag: 'button', text: 'Main' }],
      windowBounds,
    )
    expect(candidates[0].frameId).toBe(0)
  })

  it('uses explicit frameId parameter', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ rect: { h: 20, w: 50, x: 0, y: 0 }, tag: 'button', text: 'Iframe' }],
      windowBounds,
      88, // chrome height
      5, // frameId
    )
    expect(candidates[0].frameId).toBe(5)
  })

  it('reads per-element _frameId from tagged elements (extension bridge)', () => {
    // The extension bridge tags each element with _frameId
    const taggedEl = {
      _frameId: 3,
      rect: { h: 30, w: 200, x: 0, y: 0 },
      tag: 'input',
      type: 'text',
    } as any
    const candidates = chromeElementsToTargetCandidates(
      [taggedEl],
      windowBounds,
      88, // chrome height
      0, // default frameId param = 0
    )
    // Per-element _frameId should override the function-level param
    expect(candidates[0].frameId).toBe(3)
  })

  it('applies tagged frame offsets before converting to screen coordinates', () => {
    const taggedEl = {
      _frameId: 3,
      _frameOffsetX: 220,
      _frameOffsetY: 140,
      rect: { h: 32, w: 90, x: 12, y: 24 },
      tag: 'button',
      text: 'Iframe CTA',
    } as any

    const candidates = chromeElementsToTargetCandidates(
      [taggedEl],
      windowBounds,
      88,
      0,
    )

    expect(candidates[0].bounds.x).toBe(100 + 220 + 12)
    expect(candidates[0].bounds.y).toBe(50 + 88 + 140 + 24)
  })

  it('uses cumulative nested iframe offsets before converting to screen coordinates', () => {
    const parentFrameOffset = { x: 320, y: 180 }
    const childFrameOffset = { x: 24, y: 48 }
    const nestedFrameOffset = {
      x: parentFrameOffset.x + childFrameOffset.x,
      y: parentFrameOffset.y + childFrameOffset.y,
    }
    const taggedEl = {
      _frameId: 9,
      _frameOffsetX: nestedFrameOffset.x,
      _frameOffsetY: nestedFrameOffset.y,
      rect: { h: 32, w: 90, x: 12, y: 24 },
      tag: 'button',
      text: 'Nested iframe CTA',
    } as any

    const candidates = chromeElementsToTargetCandidates(
      [taggedEl],
      windowBounds,
      88,
      0,
    )

    expect(candidates[0].frameId).toBe(9)
    expect(candidates[0].bounds.x).toBe(100 + 320 + 24 + 12)
    expect(candidates[0].bounds.y).toBe(50 + 88 + 180 + 48 + 24)
    expect(candidates[0].bounds.width).toBe(90)
    expect(candidates[0].bounds.height).toBe(32)
  })

  it('falls back to function-level frameId when _frameId is absent', () => {
    const el = {
      rect: { h: 20, w: 50, x: 0, y: 0 },
      tag: 'button',
      text: 'No tag',
      // no _frameId
    }
    const candidates = chromeElementsToTargetCandidates(
      [el],
      windowBounds,
      88,
      7,
    )
    expect(candidates[0].frameId).toBe(7)
  })

  // -----------------------------------------------------------------------
  // End-to-end routing scenario: selector → router → decision
  // -----------------------------------------------------------------------

  it('candidate with id goes through full routing as browser_dom click', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ id: 'login-btn', rect: { h: 30, w: 80, x: 0, y: 0 }, tag: 'button', text: 'Login' }],
      windowBounds,
    )
    // Assign an id like the grounding layer would
    candidates[0].id = 't_0'

    const decision = decideBrowserAction(candidates[0], true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('clickSelector')
    expect(decision.selector).toBe('#login-btn')
  })

  it('candidate without identifiers routes to os_input', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ rect: { h: 14, w: 60, x: 0, y: 0 }, tag: 'span', text: 'plain text' }],
      windowBounds,
    )
    candidates[0].id = 't_0'

    const decision = decideBrowserAction(candidates[0], true)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('no CSS selector')
  })

  it('checkbox candidate goes through routing as checkCheckbox', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ id: 'agree', rect: { h: 16, w: 16, x: 0, y: 0 }, tag: 'input', type: 'checkbox' }],
      windowBounds,
    )
    candidates[0].id = 't_0'

    const decision = decideBrowserAction(candidates[0], true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('checkCheckbox')
  })

  it('text input candidate goes through type routing as setInputValue', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ name: 'user-email', rect: { h: 30, w: 200, x: 0, y: 0 }, tag: 'input', type: 'email' }],
      windowBounds,
    )
    candidates[0].id = 't_0'

    const decision = decideBrowserTypeAction(candidates[0], true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('setInputValue')
    expect(decision.selector).toBe('input[name="user-email"]')
  })

  it('non-text-input candidate falls back to os_input for type action', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ id: 'send', rect: { h: 30, w: 80, x: 0, y: 0 }, tag: 'button', text: 'Send' }],
      windowBounds,
    )
    candidates[0].id = 't_0'

    const decision = decideBrowserTypeAction(candidates[0], true)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('not a text input')
  })
})

// ---------------------------------------------------------------------------
// captureChromeSemantics
// ---------------------------------------------------------------------------

describe('captureChromeSemantics', () => {
  it('returns null when both bridges are undefined', async () => {
    const result = await captureChromeSemantics(undefined, undefined)
    expect(result).toBeNull()
  })

  it('uses extension bridge when connected', async () => {
    const mockExtension = {
      getStatus: () => ({ connected: true, enabled: true, host: 'localhost', pendingRequests: 0, port: 8080 }),
      readAllFramesDom: vi.fn().mockResolvedValue([
        {
          frameId: 0,
          result: {
            interactiveElements: [
              { rect: { h: 20, w: 50, x: 0, y: 0 }, tag: 'button', text: 'Click' },
            ],
            title: 'Example',
            url: 'https://example.com',
          },
        },
        {
          frameId: 5,
          result: {
            frameOffset: { x: 320, y: 180 },
            interactiveElements: [
              { name: 'email', rect: { h: 28, w: 140, x: 16, y: 22 }, tag: 'input' },
            ],
            title: 'Iframe',
            url: 'https://example.com/iframe',
          },
        },
      ]),
    }

    const result = await captureChromeSemantics(mockExtension as any, undefined)
    expect(result).not.toBeNull()
    expect(result!.source).toBe('extension')
    expect(result!.pageUrl).toBe('https://example.com')
    expect(result!.interactiveElements).toHaveLength(2)
    const iframeElement = result!.interactiveElements[1] as Record<string, unknown>
    expect(iframeElement._frameId).toBe(5)
    expect(iframeElement._frameOffsetX).toBe(320)
    expect(iframeElement._frameOffsetY).toBe(180)
  })

  it('falls back to CDP when extension is disconnected', async () => {
    const mockExtension = {
      getStatus: () => ({ connected: false, enabled: true, host: 'localhost', pendingRequests: 0, port: 8080 }),
    }

    const mockCdp = {
      collectInteractiveElements: vi.fn().mockResolvedValue([
        { rect: { h: 20, w: 100, x: 0, y: 0 }, tag: 'input', text: '' },
      ]),
      getStatus: () => ({ cdpUrl: 'http://localhost:9222', connected: true, pageTitle: 'CDP', pageUrl: 'https://cdp.com' }),
    }

    const result = await captureChromeSemantics(mockExtension as any, mockCdp as any)
    expect(result).not.toBeNull()
    expect(result!.source).toBe('cdp')
    expect(result!.pageUrl).toBe('https://cdp.com')
  })

  it('returns null when extension throws and CDP unavailable', async () => {
    const mockExtension = {
      getStatus: () => { throw new Error('boom') },
    }

    const result = await captureChromeSemantics(mockExtension as any, undefined)
    expect(result).toBeNull()
  })
})
