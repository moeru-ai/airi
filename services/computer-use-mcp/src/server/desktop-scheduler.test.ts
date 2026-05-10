import type { BrowserSurfaceAvailability } from '../types'

import { describe, expect, it } from 'vitest'

import { decideDesktopExecutionMode } from './desktop-scheduler'

function makeBrowserSurfaceAvailability(): BrowserSurfaceAvailability {
  return {
    executionMode: 'local-windowed' as const,
    suitable: true,
    availableSurfaces: ['browser_dom', 'browser_cdp'],
    preferredSurface: 'browser_dom' as const,
    selectedToolName: 'browser_dom_read_page' as const,
    reason: 'connected',
    extension: {
      enabled: true,
      connected: true,
    },
    cdp: {
      endpoint: 'http://localhost:9222',
      connected: true,
      connectable: true,
    },
  }
}

describe('decideDesktopExecutionMode', () => {
  it('keeps desktop_observe background when Chrome capture is disabled', () => {
    const decision = decideDesktopExecutionMode({
      action: { kind: 'desktop_observe', input: { includeChrome: false } },
    })

    expect(decision).toMatchObject({
      executionMode: 'background',
      foregroundRequired: false,
    })
  })

  it('treats desktop_observe as browser_surface when browser surfaces are available', () => {
    const decision = decideDesktopExecutionMode({
      action: { kind: 'desktop_observe', input: { includeChrome: true } },
      browserSurface: makeBrowserSurfaceAvailability(),
    })

    expect(decision).toMatchObject({
      executionMode: 'browser_surface',
      browserSurfacePreferred: true,
      foregroundRequired: false,
    })
  })

  it('keeps desktop_click_target background-safe when browser_dom is available', () => {
    const decision = decideDesktopExecutionMode({
      action: { kind: 'desktop_click_target', input: { candidateId: 't_0' } },
      browserSurface: makeBrowserSurfaceAvailability(),
      browserDomRoute: true,
    })

    expect(decision).toMatchObject({
      executionMode: 'browser_surface',
      browserSurfacePreferred: true,
      foregroundRequired: false,
    })
  })

  it('treats clipboard and wait actions as background-safe', () => {
    const waitDecision = decideDesktopExecutionMode({
      action: { kind: 'wait', input: { durationMs: 250 } },
    })
    const clipboardDecision = decideDesktopExecutionMode({
      action: { kind: 'clipboard_read_text', input: {} },
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
