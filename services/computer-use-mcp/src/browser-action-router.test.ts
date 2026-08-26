import type { DesktopTargetCandidate } from './desktop-grounding-types'

import { describe, expect, it } from 'vitest'

import { decideBrowserAction, decideBrowserTypeAction } from './browser-action-router'

function makeCandidate(overrides: Partial<DesktopTargetCandidate> = {}): DesktopTargetCandidate {
  return {
    appName: 'Google Chrome',
    bounds: { height: 30, width: 80, x: 100, y: 200 },
    confidence: 0.95,
    frameId: 0,
    id: 't_0',
    interactable: true,
    isPageContent: true,
    label: 'Submit',
    role: 'button',
    selector: '#submit-btn',
    source: 'chrome_dom',
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
      inputType: 'checkbox',
      selector: '#agree-checkbox',
      tag: 'input',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('checkCheckbox')
    expect(decision.selector).toBe('#agree-checkbox')
  })

  it('routes checkbox by role to checkCheckbox', () => {
    const decision = decideBrowserAction(makeCandidate({
      role: 'checkbox',
      selector: 'div.custom-checkbox',
      tag: 'div',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('checkCheckbox')
  })

  it('routes regular button to clickSelector, not checkCheckbox', () => {
    const decision = decideBrowserAction(makeCandidate({
      role: 'button',
      tag: 'button',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('clickSelector')
  })

  it('routes radio input to clickSelector, not checkCheckbox', () => {
    const decision = decideBrowserAction(makeCandidate({
      inputType: 'radio',
      selector: 'input[name="color"]',
      tag: 'input',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('clickSelector')
  })

  it('routes link element to clickSelector', () => {
    const decision = decideBrowserAction(makeCandidate({
      href: 'https://example.com',
      role: 'link',
      selector: 'a.nav-link',
      tag: 'a',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('clickSelector')
  })

  it('checkbox with bridge down falls back to os_input, not checkCheckbox', () => {
    const decision = decideBrowserAction(makeCandidate({
      inputType: 'checkbox',
      selector: '#agree',
      tag: 'input',
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
      inputType: 'text',
      selector: 'input[name="email"]',
      tag: 'input',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('setInputValue')
    expect(decision.selector).toBe('input[name="email"]')
  })

  it('routes password input to setInputValue', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      inputType: 'password',
      selector: '#password',
      tag: 'input',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('setInputValue')
  })

  it('routes textarea to setInputValue', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      selector: '#message',
      tag: 'textarea',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('setInputValue')
  })

  it('routes input without explicit type (defaults to text) to setInputValue', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      inputType: undefined,
      selector: '#name',
      tag: 'input',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('setInputValue')
  })

  it('routes contenteditable via role=textbox to setInputValue', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      role: 'textbox',
      selector: 'div.editor',
      tag: 'div',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('setInputValue')
  })

  it('falls back to os_input for button elements', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      role: 'button',
      tag: 'button',
    }), true)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('not a text input')
  })

  it('falls back to os_input for checkbox inputs', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      inputType: 'checkbox',
      tag: 'input',
    }), true)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('not a text input')
  })

  it('falls back to os_input for file inputs', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      inputType: 'file',
      tag: 'input',
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
      inputType: 'text',
      tag: 'input',
    }), false)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('not connected')
  })

  it('falls back to os_input when selector is missing', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      inputType: 'text',
      selector: undefined,
      tag: 'input',
    }), true)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('no CSS selector')
  })

  it('routes number input to setInputValue', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      inputType: 'number',
      selector: '#quantity',
      tag: 'input',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('setInputValue')
  })

  it('routes search input to setInputValue', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      inputType: 'search',
      selector: '#search',
      tag: 'input',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('setInputValue')
  })

  it('routes url input to setInputValue', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      inputType: 'url',
      selector: '#website',
      tag: 'input',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('setInputValue')
  })

  it('routes tel input to setInputValue', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      inputType: 'tel',
      selector: '#phone',
      tag: 'input',
    }), true)
    expect(decision.route).toBe('browser_dom')
    expect(decision.bridgeMethod).toBe('setInputValue')
  })

  it('falls back to os_input for radio inputs', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      inputType: 'radio',
      selector: 'input[name="option"]',
      tag: 'input',
    }), true)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('not a text input')
  })

  it('falls back to os_input for hidden inputs', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      inputType: 'hidden',
      selector: '#csrf',
      tag: 'input',
    }), true)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('not a text input')
  })

  it('falls back to os_input for color picker inputs', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      inputType: 'color',
      selector: '#color-pick',
      tag: 'input',
    }), true)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('not a text input')
  })

  it('select element falls back to os_input for type (not a text input)', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      selector: '#country',
      tag: 'select',
    }), true)
    expect(decision.route).toBe('os_input')
    expect(decision.reason).toContain('not a text input')
  })

  it('returns reason string that includes the selector on success', () => {
    const decision = decideBrowserTypeAction(makeCandidate({
      inputType: 'text',
      selector: '#my-input',
      tag: 'input',
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
      inputType: 'text',
      selector: '#email',
      tag: 'input',
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
      inputType: 'checkbox',
      selector: '#agree',
      tag: 'input',
    })
    const clickD = decideBrowserAction(candidate, true)
    const typeD = decideBrowserTypeAction(candidate, true)

    expect(clickD.route).toBe('browser_dom')
    expect(clickD.bridgeMethod).toBe('checkCheckbox')
    expect(typeD.route).toBe('os_input') // Can't type into a checkbox
  })

  it('button routes to clickSelector for click but os_input for type', () => {
    const candidate = makeCandidate({
      role: 'button',
      selector: '#submit',
      tag: 'button',
    })
    const clickD = decideBrowserAction(candidate, true)
    const typeD = decideBrowserTypeAction(candidate, true)

    expect(clickD.route).toBe('browser_dom')
    expect(clickD.bridgeMethod).toBe('clickSelector')
    expect(typeD.route).toBe('os_input')
  })

  it('ax candidate always routes to os_input for both click and type', () => {
    const candidate = makeCandidate({ selector: '#whatever', source: 'ax' })
    const clickD = decideBrowserAction(candidate, true)
    const typeD = decideBrowserTypeAction(candidate, true)

    expect(clickD.route).toBe('os_input')
    expect(typeD.route).toBe('os_input')
  })

  it('bridge-down candidate routes to os_input for both click and type', () => {
    const candidate = makeCandidate({
      inputType: 'text',
      selector: '#email',
      tag: 'input',
    })
    const clickD = decideBrowserAction(candidate, false)
    const typeD = decideBrowserTypeAction(candidate, false)

    expect(clickD.route).toBe('os_input')
    expect(typeD.route).toBe('os_input')
  })
})
