import { describe, expect, it, vi } from 'vitest'

import { decideBrowserAction, decideBrowserTypeAction } from './browser-action-router'
import { captureChromeSemantics, chromeElementsToTargetCandidates } from './chrome-semantic-adapter'

// ---------------------------------------------------------------------------
// chromeElementsToTargetCandidates
// ---------------------------------------------------------------------------

describe('chromeElementsToTargetCandidates', () => {
  const windowBounds = { x: 100, y: 50, width: 1200, height: 800 }

  it('transforms page-relative rects to screen-absolute', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{
        tag: 'button',
        text: 'Submit',
        rect: { x: 10, y: 20, w: 80, h: 30 },
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
      [{ tag: 'button', text: 'A', rect: { x: 0, y: 0, w: 50, h: 20 } }],
      windowBounds,
      100, // custom chrome height
    )
    expect(candidates[0].bounds.y).toBe(50 + 100 + 0)
  })

  it('skips elements with zero-size rects', () => {
    const candidates = chromeElementsToTargetCandidates(
      [
        { tag: 'button', text: 'Zero', rect: { x: 0, y: 0, w: 0, h: 0 } },
        { tag: 'button', text: 'Valid', rect: { x: 10, y: 10, w: 50, h: 20 } },
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
        { tag: 'button', text: 'Below', rect: { x: 10, y: 2000, w: 50, h: 20 } },
        { tag: 'button', text: 'Inside', rect: { x: 10, y: 10, w: 50, h: 20 } },
      ],
      windowBounds,
    )
    expect(candidates).toHaveLength(1)
    expect(candidates[0].label).toBe('Inside')
  })

  it('sets source to chrome_dom', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'a', text: 'Link', rect: { x: 0, y: 0, w: 40, h: 16 } }],
      windowBounds,
    )
    expect(candidates[0].source).toBe('chrome_dom')
  })

  it('buttons get high confidence', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'button', text: 'Go', rect: { x: 0, y: 0, w: 50, h: 20 } }],
      windowBounds,
    )
    expect(candidates[0].confidence).toBe(0.95)
  })

  it('disabled elements get low confidence', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'button', text: 'Disabled', rect: { x: 0, y: 0, w: 50, h: 20 }, disabled: true }],
      windowBounds,
    )
    expect(candidates[0].confidence).toBe(0.3)
    expect(candidates[0].interactable).toBe(false)
  })

  it('builds label from text, placeholder, name, id, href', () => {
    const textLabel = chromeElementsToTargetCandidates(
      [{ tag: 'button', text: 'Click me', rect: { x: 0, y: 0, w: 50, h: 20 } }],
      windowBounds,
    )
    expect(textLabel[0].label).toBe('Click me')

    const placeholderLabel = chromeElementsToTargetCandidates(
      [{ tag: 'input', placeholder: 'Enter name', rect: { x: 0, y: 0, w: 50, h: 20 } }],
      windowBounds,
    )
    expect(placeholderLabel[0].label).toBe('[Enter name]')

    const idLabel = chromeElementsToTargetCandidates(
      [{ tag: 'div', id: 'main-cta', rect: { x: 0, y: 0, w: 50, h: 20 } }],
      windowBounds,
    )
    expect(idLabel[0].label).toBe('#main-cta')
  })

  // -----------------------------------------------------------------------
  // Selector building (v2)
  // -----------------------------------------------------------------------

  it('builds selector from element id (highest priority)', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'button', id: 'submit-btn', text: 'Go', rect: { x: 0, y: 0, w: 50, h: 20 } }],
      windowBounds,
    )
    expect(candidates[0].selector).toBe('#submit-btn')
  })

  it('escapes special characters in id selectors', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'div', id: 'my.element:1', rect: { x: 0, y: 0, w: 50, h: 20 } }],
      windowBounds,
    )
    // dots and colons must be escaped
    expect(candidates[0].selector).toBe('#my\\.element\\:1')
  })

  it('builds selector from name attribute (second priority)', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'input', name: 'email', rect: { x: 0, y: 0, w: 100, h: 20 } }],
      windowBounds,
    )
    expect(candidates[0].selector).toBe('input[name="email"]')
  })

  it('escapes quotes in name attribute selectors', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'input', name: 'field"evil', rect: { x: 0, y: 0, w: 100, h: 20 } }],
      windowBounds,
    )
    expect(candidates[0].selector).toBe('input[name="field\\"evil"]')
  })

  it('builds selector from tag+type for input elements (third priority)', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'input', type: 'submit', rect: { x: 0, y: 0, w: 80, h: 30 } }],
      windowBounds,
    )
    expect(candidates[0].selector).toBe('input[type="submit"]')
  })

  it('builds selector from tag+type for button elements', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'button', type: 'submit', rect: { x: 0, y: 0, w: 80, h: 30 } }],
      windowBounds,
    )
    expect(candidates[0].selector).toBe('button[type="submit"]')
  })

  it('does not use tag+type for non-input/button elements', () => {
    // A <div> with type attr should NOT get a tag[type=...] selector
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'div', type: 'custom', className: 'widget', rect: { x: 0, y: 0, w: 80, h: 30 } }],
      windowBounds,
    )
    // Should fall through to className-based selector
    expect(candidates[0].selector).toBe('div.widget')
  })

  it('builds selector from first className (fourth priority)', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'a', className: 'nav-link primary', rect: { x: 0, y: 0, w: 60, h: 16 } }],
      windowBounds,
    )
    expect(candidates[0].selector).toBe('a.nav-link')
  })

  it('returns undefined selector when no identifying attribute exists', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'span', text: 'orphan', rect: { x: 0, y: 0, w: 40, h: 14 } }],
      windowBounds,
    )
    expect(candidates[0].selector).toBeUndefined()
  })

  it('prefers id over name over type over className', () => {
    // Element with all attributes — id should win
    const candidates = chromeElementsToTargetCandidates(
      [{
        tag: 'input',
        id: 'email-input',
        name: 'email',
        type: 'text',
        className: 'form-control',
        rect: { x: 0, y: 0, w: 200, h: 30 },
      }],
      windowBounds,
    )
    expect(candidates[0].selector).toBe('#email-input')
  })

  it('falls through to name when id is empty/whitespace', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'input', id: '  ', name: 'username', rect: { x: 0, y: 0, w: 200, h: 30 } }],
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
        { tag: 'button', text: 'A', rect: { x: 0, y: 0, w: 50, h: 20 } },
        { tag: 'input', type: 'text', rect: { x: 0, y: 30, w: 200, h: 30 } },
        { tag: 'a', href: '/about', text: 'About', rect: { x: 0, y: 70, w: 40, h: 16 } },
      ],
      windowBounds,
    )
    for (const c of candidates) {
      expect(c.isPageContent).toBe(true)
    }
  })

  it('sets enabled=true for non-disabled elements', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'button', text: 'Active', rect: { x: 0, y: 0, w: 50, h: 20 } }],
      windowBounds,
    )
    expect(candidates[0].enabled).toBe(true)
  })

  it('sets enabled=false for disabled elements', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'button', text: 'Nope', disabled: true, rect: { x: 0, y: 0, w: 50, h: 20 } }],
      windowBounds,
    )
    expect(candidates[0].enabled).toBe(false)
    expect(candidates[0].interactable).toBe(false)
  })

  it('carries inputType from element type attribute', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'input', type: 'password', rect: { x: 0, y: 0, w: 200, h: 30 } }],
      windowBounds,
    )
    expect(candidates[0].inputType).toBe('password')
  })

  it('carries href for link elements', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'a', href: 'https://example.com', text: 'Link', rect: { x: 0, y: 0, w: 40, h: 16 } }],
      windowBounds,
    )
    expect(candidates[0].href).toBe('https://example.com')
  })

  // -----------------------------------------------------------------------
  // Frame ID propagation (v2)
  // -----------------------------------------------------------------------

  it('uses default frameId=0 when not specified', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'button', text: 'Main', rect: { x: 0, y: 0, w: 50, h: 20 } }],
      windowBounds,
    )
    expect(candidates[0].frameId).toBe(0)
  })

  it('uses explicit frameId parameter', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'button', text: 'Iframe', rect: { x: 0, y: 0, w: 50, h: 20 } }],
      windowBounds,
      88, // chrome height
      5, // frameId
    )
    expect(candidates[0].frameId).toBe(5)
  })

  it('reads per-element _frameId from tagged elements (extension bridge)', () => {
    // The extension bridge tags each element with _frameId
    const taggedEl = {
      tag: 'input',
      type: 'text',
      rect: { x: 0, y: 0, w: 200, h: 30 },
      _frameId: 3,
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

  it('falls back to function-level frameId when _frameId is absent', () => {
    const el = {
      tag: 'button',
      text: 'No tag',
      rect: { x: 0, y: 0, w: 50, h: 20 },
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
      [{ tag: 'button', id: 'login-btn', text: 'Login', rect: { x: 0, y: 0, w: 80, h: 30 } }],
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
      [{ tag: 'span', text: 'plain text', rect: { x: 0, y: 0, w: 60, h: 14 } }],
      windowBounds,
    )
    candidates[0].id = 't_0'

    const decision = decideBrowserAction(candidates[0], true)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('no CSS selector')
  })

  it('checkbox candidate goes through routing as checkCheckbox', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'input', type: 'checkbox', id: 'agree', rect: { x: 0, y: 0, w: 16, h: 16 } }],
      windowBounds,
    )
    candidates[0].id = 't_0'

    const decision = decideBrowserAction(candidates[0], true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('checkCheckbox')
  })

  it('text input candidate goes through type routing as setInputValue', () => {
    const candidates = chromeElementsToTargetCandidates(
      [{ tag: 'input', type: 'email', name: 'user-email', rect: { x: 0, y: 0, w: 200, h: 30 } }],
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
      [{ tag: 'button', id: 'send', text: 'Send', rect: { x: 0, y: 0, w: 80, h: 30 } }],
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
      getStatus: () => ({ connected: true, enabled: true, host: 'localhost', port: 8080, pendingRequests: 0 }),
      readAllFramesDom: vi.fn().mockResolvedValue([
        {
          frameId: 0,
          result: {
            url: 'https://example.com',
            title: 'Example',
            interactiveElements: [
              { tag: 'button', text: 'Click', rect: { x: 0, y: 0, w: 50, h: 20 } },
            ],
          },
        },
      ]),
    }

    const result = await captureChromeSemantics(mockExtension as any, undefined)
    expect(result).not.toBeNull()
    expect(result!.source).toBe('extension')
    expect(result!.pageUrl).toBe('https://example.com')
    expect(result!.interactiveElements).toHaveLength(1)
  })

  it('falls back to CDP when extension is disconnected', async () => {
    const mockExtension = {
      getStatus: () => ({ connected: false, enabled: true, host: 'localhost', port: 8080, pendingRequests: 0 }),
    }

    const mockCdp = {
      getStatus: () => ({ connected: true, cdpUrl: 'http://localhost:9222', pageUrl: 'https://cdp.com', pageTitle: 'CDP' }),
      collectInteractiveElements: vi.fn().mockResolvedValue([
        { tag: 'input', text: '', rect: { x: 0, y: 0, w: 100, h: 20 } },
      ]),
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
