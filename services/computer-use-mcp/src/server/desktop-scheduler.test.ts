import type { BrowserSurfaceAvailability } from '../types'

import { describe, expect, it } from 'vitest'

import { decideDesktopExecutionMode } from './desktop-scheduler'

function makeBrowserSurfaceAvailability(): BrowserSurfaceAvailability {
  return {
    availableSurfaces: ['browser_dom', 'browser_cdp'],
    cdp: {
      connectable: true,
      connected: true,
      endpoint: 'http://localhost:9222',
    },
    executionMode: 'local-windowed' as const,
    extension: {
      connected: true,
      enabled: true,
    },
    preferredSurface: 'browser_dom' as const,
    reason: 'connected',
    selectedToolName: 'browser_dom_read_page' as const,
    suitable: true,
  }
}

describe('decideDesktopExecutionMode', () => {
  it('keeps desktop_observe background when Chrome capture is disabled', () => {
    const decision = decideDesktopExecutionMode({
      action: { input: { includeChrome: false }, kind: 'desktop_observe' },
    })

    expect(decision).toMatchObject({
      executionMode: 'background',
      foregroundRequired: false,
    })
  })

  it('treats desktop_observe as browser_surface when browser surfaces are available', () => {
    const decision = decideDesktopExecutionMode({
      action: { input: { includeChrome: true }, kind: 'desktop_observe' },
      browserSurface: makeBrowserSurfaceAvailability(),
    })

    expect(decision).toMatchObject({
      browserSurfacePreferred: true,
      executionMode: 'browser_surface',
      foregroundRequired: false,
    })
  })

  it('keeps desktop_click_target background-safe when browser_dom is available', () => {
    const decision = decideDesktopExecutionMode({
      action: { input: { candidateId: 't_0' }, kind: 'desktop_click_target' },
      browserDomRoute: true,
      browserSurface: makeBrowserSurfaceAvailability(),
    })

    expect(decision).toMatchObject({
      browserSurfacePreferred: true,
      executionMode: 'browser_surface',
      foregroundRequired: false,
    })
  })

  it('treats clipboard and wait actions as background-safe', () => {
    const waitDecision = decideDesktopExecutionMode({
      action: { input: { durationMs: 250 }, kind: 'wait' },
    })
    const clipboardDecision = decideDesktopExecutionMode({
      action: { input: {}, kind: 'clipboard_read_text' },
    })

    expect(waitDecision).toMatchObject({
      executionMode: 'background',
      foregroundRequired: false,
    })
    expect(clipboardDecision).toMatchObject({
      executionMode: 'background',
      foregroundRequired: false,
    })
  })
})
