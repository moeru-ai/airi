import { describe, expect, it, vi } from 'vitest'

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

  it('unwraps extension frame payloads nested under result.data', async () => {
    const mockExtension = {
      getStatus: () => ({ connected: true, enabled: true, host: 'localhost', port: 8080, pendingRequests: 0 }),
      readAllFramesDom: vi.fn().mockResolvedValue([
        {
          frameId: 0,
          result: {
            data: {
              url: 'https://nested.example.com',
              title: 'Nested Example',
              interactiveElements: [
                { tag: 'button', text: 'Nested click', rect: { x: 0, y: 0, w: 50, h: 20 } },
              ],
            },
          },
        },
      ]),
    }

    const result = await captureChromeSemantics(mockExtension as any, undefined)
    expect(result).not.toBeNull()
    expect(result!.pageUrl).toBe('https://nested.example.com')
    expect(result!.pageTitle).toBe('Nested Example')
    expect(result!.interactiveElements).toHaveLength(1)
  })

  it('applies iframe offsets before returning extension frame elements', async () => {
    const mockExtension = {
      getStatus: () => ({ connected: true, enabled: true, host: 'localhost', port: 8080, pendingRequests: 0 }),
      getAllFrames: vi.fn().mockResolvedValue([
        { frameId: 0, parentFrameId: -1 },
        { frameId: 7, parentFrameId: 0 },
      ]),
      readAllFramesDom: vi.fn().mockResolvedValue([
        {
          frameId: 0,
          result: {
            url: 'https://example.com',
            title: 'Example',
            interactiveElements: [],
          },
        },
        {
          frameId: 7,
          result: {
            frameRect: { x: 120, y: 80, w: 640, h: 480 },
            interactiveElements: [
              { tag: 'button', text: 'Iframe CTA', rect: { x: 10, y: 20, w: 50, h: 20 } },
            ],
          },
        },
      ]),
    }

    const result = await captureChromeSemantics(mockExtension as any, undefined)
    expect(result).not.toBeNull()
    expect(result!.interactiveElements).toHaveLength(1)
    expect(result!.interactiveElements[0].rect).toEqual({
      x: 130,
      y: 100,
      w: 50,
      h: 20,
    })
  })

  it('skips subframe elements when iframe offsets are unavailable', async () => {
    const mockExtension = {
      getStatus: () => ({ connected: true, enabled: true, host: 'localhost', port: 8080, pendingRequests: 0 }),
      getAllFrames: vi.fn().mockResolvedValue([
        { frameId: 0, parentFrameId: -1 },
        { frameId: 9, parentFrameId: 0 },
      ]),
      readAllFramesDom: vi.fn().mockResolvedValue([
        {
          frameId: 0,
          result: {
            url: 'https://example.com',
            title: 'Example',
            interactiveElements: [
              { tag: 'button', text: 'Root CTA', rect: { x: 0, y: 0, w: 20, h: 20 } },
            ],
          },
        },
        {
          frameId: 9,
          result: {
            interactiveElements: [
              { tag: 'button', text: 'Iframe CTA', rect: { x: 10, y: 20, w: 50, h: 20 } },
            ],
          },
        },
      ]),
    }

    const result = await captureChromeSemantics(mockExtension as any, undefined)
    expect(result).not.toBeNull()
    expect(result!.interactiveElements).toHaveLength(1)
    expect(result!.interactiveElements[0].text).toBe('Root CTA')
  })

  it('resolves nested iframe offsets even when frame results arrive out of order', async () => {
    const mockExtension = {
      getStatus: () => ({ connected: true, enabled: true, host: 'localhost', port: 8080, pendingRequests: 0 }),
      getAllFrames: vi.fn().mockResolvedValue([
        { frameId: 0, parentFrameId: -1 },
        { frameId: 7, parentFrameId: 0 },
        { frameId: 12, parentFrameId: 7 },
      ]),
      readAllFramesDom: vi.fn().mockResolvedValue([
        {
          frameId: 12,
          result: {
            frameRect: { x: 15, y: 25, w: 320, h: 200 },
            interactiveElements: [
              { tag: 'button', text: 'Nested CTA', rect: { x: 3, y: 4, w: 40, h: 20 } },
            ],
          },
        },
        {
          frameId: 0,
          result: {
            url: 'https://example.com',
            title: 'Example',
            interactiveElements: [],
          },
        },
        {
          frameId: 7,
          result: {
            frameRect: { x: 120, y: 80, w: 640, h: 480 },
            interactiveElements: [],
          },
        },
      ]),
    }

    const result = await captureChromeSemantics(mockExtension as any, undefined)
    expect(result).not.toBeNull()
    expect(result!.interactiveElements).toHaveLength(1)
    expect(result!.interactiveElements[0].rect).toEqual({
      x: 138,
      y: 109,
      w: 40,
      h: 20,
    })
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
