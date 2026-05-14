import type { DesktopTargetCandidate } from './desktop-grounding-types'

import { describe, expect, it } from 'vitest'

import { decideBrowserAction, decideBrowserTypeAction } from './browser-action-router'

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

// ---------------------------------------------------------------------------
// decideBrowserAction (click routing)
// ---------------------------------------------------------------------------

describe('decideBrowserAction', () => {
  it('routes chrome_dom with selector + bridge available to browser_dom', () => {
    const decision = decideBrowserAction(makeCandidate(), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.selector).toBe('#submit-btn')
    expect(decision.frameId).toBe(0)
    expect(decision.bridgeMethod).toBe('clickSelector')
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

  it('falls back to os_input for right clicks even when chrome_dom is available', () => {
    const decision = decideBrowserAction(makeCandidate(), true, 'right')
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('left single-click')
  })

  it('falls back to os_input for multi-click chrome_dom actions', () => {
    const decision = decideBrowserAction(makeCandidate(), true, 'left', 2)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('count 2')
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

  it('routes checkbox to checkCheckbox instead of clickSelector', () => {
    const decision = decideBrowserAction(makeCandidate({
      tag: 'input',
      inputType: 'checkbox',
      selector: '#agree-checkbox',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('checkCheckbox')
    expect(decision.selector).toBe('#agree-checkbox')
  })

  it('routes checkbox by role to checkCheckbox', () => {
    const decision = decideBrowserAction(makeCandidate({
      tag: 'div',
      role: 'checkbox',
      selector: 'div.custom-checkbox',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('checkCheckbox')
  })

  it('routes regular button to clickSelector, not checkCheckbox', () => {
    const decision = decideBrowserAction(makeCandidate({
      tag: 'button',
      role: 'button',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('clickSelector')
  })

  it('routes radio input to clickSelector, not checkCheckbox', () => {
    const decision = decideBrowserAction(makeCandidate({
      tag: 'input',
      inputType: 'radio',
      selector: 'input[name="color"]',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('clickSelector')
  })

  it('routes link element to clickSelector', () => {
    const decision = decideBrowserAction(makeCandidate({
      tag: 'a',
      role: 'link',
      href: 'https://example.com',
      selector: 'a.nav-link',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('clickSelector')
  })

  it('checkbox with bridge down falls back to os_input, not checkCheckbox', () => {
    const decision = decideBrowserAction(makeCandidate({
      tag: 'input',
      inputType: 'checkbox',
      selector: '#agree',
    }), false)
    expect(decision.route).toBe('os_input')
    expect(decision.bridgeMethod).toBeUndefined()
  })

  it('returns reason string that includes the selector', () => {
    const decision = decideBrowserAction(makeCandidate({ selector: '#my-btn' }), true)
    expect(decision.reason).toContain('#my-btn')
  })
})

// ---------------------------------------------------------------------------
// decideBrowserTypeAction (type routing)
// ---------------------------------------------------------------------------

describe('decideBrowserTypeAction', () => {
  it('routes text input to setInputValue', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      tag: 'input',
      inputType: 'text',
      selector: 'input[name="email"]',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('setInputValue')
    expect(decision.selector).toBe('input[name="email"]')
  })

  it('routes password input to setInputValue', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      tag: 'input',
      inputType: 'password',
      selector: '#password',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('setInputValue')
  })

  it('routes textarea to setInputValue', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      tag: 'textarea',
      selector: '#message',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('setInputValue')
  })

  it('routes input without explicit type (defaults to text) to setInputValue', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      tag: 'input',
      inputType: undefined,
      selector: '#name',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('setInputValue')
  })

  it('routes contenteditable via role=textbox to setInputValue', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      tag: 'div',
      role: 'textbox',
      selector: 'div.editor',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('setInputValue')
  })

  it('falls back to os_input for button elements', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      tag: 'button',
      role: 'button',
    }), true)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('not a text input')
  })

  it('falls back to os_input for checkbox inputs', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      tag: 'input',
      inputType: 'checkbox',
    }), true)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('not a text input')
  })

  it('falls back to os_input for file inputs', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      tag: 'input',
      inputType: 'file',
    }), true)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('not a text input')
  })

  it('falls back to os_input when source is ax', () => {
    const decision = decideBrowserTypeAction(makeCandidate({ source: 'ax' }), true)
    expect(decision.route).toBe('os_input')
  })

  it('falls back to os_input when bridge is unavailable', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      tag: 'input',
      inputType: 'text',
    }), false)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('not connected')
  })

  it('falls back to os_input when selector is missing', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      tag: 'input',
      inputType: 'text',
      selector: undefined,
    }), true)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('no CSS selector')
  })

  it('routes number input to setInputValue', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      tag: 'input',
      inputType: 'number',
      selector: '#quantity',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('setInputValue')
  })

  it('routes search input to setInputValue', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      tag: 'input',
      inputType: 'search',
      selector: '#search',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('setInputValue')
  })

  it('routes url input to setInputValue', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      tag: 'input',
      inputType: 'url',
      selector: '#website',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('setInputValue')
  })

  it('routes tel input to setInputValue', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      tag: 'input',
      inputType: 'tel',
      selector: '#phone',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('setInputValue')
  })

  it('falls back to os_input for radio inputs', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      tag: 'input',
      inputType: 'radio',
      selector: 'input[name="option"]',
    }), true)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('not a text input')
  })

  it('falls back to os_input for hidden inputs', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      tag: 'input',
      inputType: 'hidden',
      selector: '#csrf',
    }), true)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('not a text input')
  })

  it('falls back to os_input for color picker inputs', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      tag: 'input',
      inputType: 'color',
      selector: '#color-pick',
    }), true)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('not a text input')
  })

  it('select element falls back to os_input for type (not a text input)', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      tag: 'select',
      selector: '#country',
    }), true)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('not a text input')
  })

  it('returns reason string that includes the selector on success', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      tag: 'input',
      inputType: 'text',
      selector: '#my-input',
    }), true)
    expect(decision.reason).toContain('#my-input')
  })
})

// ---------------------------------------------------------------------------
// Cross-function consistency
// ---------------------------------------------------------------------------

describe('click + type routing consistency', () => {
  it('text input routes to clickSelector for click and setInputValue for type', () => {
    const candidate = makeCandidate({
      tag: 'input',
      inputType: 'text',
      selector: '#email',
    })
    const clickD = decideBrowserAction(candidate, true)
    const typeD = decideBrowserTypeAction(candidate, true)

    expect(clickD.route).toBe('browser_dom')
    expect(clickD.bridgeMethod).toBe('clickSelector')
    expect(typeD.route).toBe('browser_dom')
    expect(typeD.bridgeMethod).toBe('setInputValue')
    // Same selector used for both
    expect(clickD.selector).toBe(typeD.selector)
  })

  it('checkbox routes to checkCheckbox for click but os_input for type', () => {
    const candidate = makeCandidate({
      tag: 'input',
      inputType: 'checkbox',
      selector: '#agree',
    })
    const clickD = decideBrowserAction(candidate, true)
    const typeD = decideBrowserTypeAction(candidate, true)

    expect(clickD.route).toBe('browser_dom')
    expect(clickD.bridgeMethod).toBe('checkCheckbox')
    expect(typeD.route).toBe('os_input') // Can't type into a checkbox
  })

  it('button routes to clickSelector for click but os_input for type', () => {
    const candidate = makeCandidate({
      tag: 'button',
      role: 'button',
      selector: '#submit',
    })
    const clickD = decideBrowserAction(candidate, true)
    const typeD = decideBrowserTypeAction(candidate, true)

    expect(clickD.route).toBe('browser_dom')
    expect(clickD.bridgeMethod).toBe('clickSelector')
    expect(typeD.route).toBe('os_input')
  })

  it('ax candidate always routes to os_input for both click and type', () => {
    const candidate = makeCandidate({ source: 'ax', selector: '#whatever' })
    const clickD = decideBrowserAction(candidate, true)
    const typeD = decideBrowserTypeAction(candidate, true)

    expect(clickD.route).toBe('os_input')
    expect(typeD.route).toBe('os_input')
  })

  it('bridge-down candidate routes to os_input for both click and type', () => {
    const candidate = makeCandidate({
      tag: 'input',
      inputType: 'text',
      selector: '#email',
    })
    const clickD = decideBrowserAction(candidate, false)
    const typeD = decideBrowserTypeAction(candidate, false)

    expect(clickD.route).toBe('os_input')
    expect(typeD.route).toBe('os_input')
  })
})
