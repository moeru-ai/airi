import { describe, expect, it } from 'vitest'

import { diagnoseBrowserActionError } from './browser-repair-contract'

describe('browser-repair-contract', () => {
  it('suggests reading the page when a selector is not found', () => {
    const suggestion = diagnoseBrowserActionError(
      new Error('selector "#submit" did not match any element'),
      '#submit',
      'browser_dom_click',
    )

    expect(suggestion).toMatchObject({
      pattern: 'element_not_found',
      suggestedTool: 'browser_dom_read_page',
    })
    expect(suggestion?.reactionText).toContain('#submit')
  })

  it('suggests checking computed styles when an element is hidden', () => {
    const suggestion = diagnoseBrowserActionError(
      new Error('element is not visible or is covered'),
      '#menu',
      'browser_dom_click',
    )

    expect(suggestion).toMatchObject({
      pattern: 'element_not_visible',
      suggestedTool: 'browser_dom_get_computed_styles',
      suggestedParams: {
        selector: '#menu',
      },
    })
  })

  it('suggests waiting for the selector when an action times out', () => {
    const suggestion = diagnoseBrowserActionError(
      new Error('timed out waiting for selector'),
      '.toast',
      'browser_dom_wait_for_element',
    )

    expect(suggestion).toMatchObject({
      pattern: 'action_timeout',
      suggestedTool: 'browser_dom_wait_for_element',
      suggestedParams: {
        selector: '.toast',
      },
    })
  })

  it('suggests rediscovering the active tab when a frame is detached', () => {
    const suggestion = diagnoseBrowserActionError(
      new Error('frame was detached before dispatch'),
      'button',
      'browser_dom_click',
    )

    expect(suggestion).toMatchObject({
      pattern: 'frame_detached',
      suggestedTool: 'browser_dom_get_active_tab',
    })
  })

  it('returns null for unrecognized errors', () => {
    const suggestion = diagnoseBrowserActionError(
      new Error('extension returned a custom opaque error'),
      '#submit',
      'browser_dom_click',
    )

    expect(suggestion).toBeNull()
  })
})
