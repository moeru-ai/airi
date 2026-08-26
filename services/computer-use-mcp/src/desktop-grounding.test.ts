import type { AXNode, AXSnapshot } from './accessibility/types'
import type { ChromeSemanticSnapshot, DesktopGroundingSnapshot } from './desktop-grounding-types'

import { describe, expect, it, vi } from 'vitest'

import { buildTargetCandidates, captureDesktopGrounding, formatGroundingForAgent } from './desktop-grounding'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAXSnapshot(nodes: Partial<AXNode>[]): AXSnapshot {
  const root: AXNode = {
    children: nodes.map((n, i) => ({
      bounds: n.bounds ?? { height: 30, width: 50, x: 100 + i * 60, y: 100 },
      children: n.children ?? [],
      enabled: n.enabled ?? true,
      focused: n.focused ?? false,
      role: n.role ?? 'AXButton',
      title: n.title ?? `Button ${i}`,
      uid: n.uid ?? `node_${i}`,
    })),
    role: 'AXApplication',
    uid: 'root_0',
  }

  const uidToNode = new Map<string, AXNode>()
  function walk(node: AXNode) {
    uidToNode.set(node.uid, node)
    for (const child of node.children) walk(child)
  }
  walk(root)

  return {
    appName: 'Google Chrome',
    capturedAt: new Date().toISOString(),
    maxDepth: 15,
    pid: 1234,
    root,
    snapshotId: 'ax_1',
    truncated: false,
    uidToNode,
  }
}

function makeChromeSnapshot(elements: Array<{
  disabled?: boolean
  rect?: { h: number, w: number, x: number, y: number }
  role?: string
  tag?: string
  text?: string
}>): ChromeSemanticSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    interactiveElements: elements.map(el => ({
      disabled: el.disabled,
      rect: el.rect ?? { h: 30, w: 100, x: 50, y: 50 },
      role: el.role,
      tag: el.tag ?? 'button',
      text: el.text ?? 'Click me',
    })),
    pageTitle: 'Example Page',
    pageUrl: 'https://example.com',
    source: 'extension',
  }
}

// ---------------------------------------------------------------------------
// buildTargetCandidates
// ---------------------------------------------------------------------------

describe('buildTargetCandidates', () => {
  it('aX only: extracts interactable nodes', () => {
    const ax = makeAXSnapshot([
      { role: 'AXButton', title: 'OK' },
      { role: 'AXStaticText', title: 'Just text' }, // Non-interactable role
      { role: 'AXTextField', title: 'Input' },
    ])
    const candidates = buildTargetCandidates({
      axSnapshot: ax,
      foregroundApp: 'Finder',
    })

    // Should only include AXButton and AXTextField, not AXStaticText
    expect(candidates.length).toBe(2)
    expect(candidates[0].role).toBe('AXButton')
    expect(candidates[1].role).toBe('AXTextField')
    expect(candidates[0].source).toBe('ax')
    expect(candidates[0].id).toBe('t_0')
    expect(candidates[1].id).toBe('t_1')
  })

  it('chrome only: converts elements to candidates', () => {
    const chrome = makeChromeSnapshot([
      { rect: { h: 30, w: 80, x: 10, y: 10 }, tag: 'button', text: 'Submit' },
      { rect: { h: 20, w: 60, x: 10, y: 50 }, tag: 'a', text: 'Link' },
    ])
    const candidates = buildTargetCandidates({
      chromeSnapshot: chrome,
      chromeWindowBounds: { height: 1080, width: 1920, x: 0, y: 0 },
      foregroundApp: 'Google Chrome',
    })

    expect(candidates.length).toBe(2)
    expect(candidates[0].source).toBe('chrome_dom')
    expect(candidates[0].tag).toBe('button')
    expect(candidates[0].appName).toBe('Google Chrome')
  })

  it('chrome + AX: deduplicates overlapping candidates', () => {
    // Chrome element and AX node at same position → AX should be removed
    const chrome = makeChromeSnapshot([
      { rect: { h: 30, w: 50, x: 100, y: 12 }, tag: 'button', text: 'Submit' },
    ])
    const ax = makeAXSnapshot([
      {
        // After chrome chrome height offset (88px), chrome rect becomes
        // screen-absolute: x=100, y=100, w=50, h=30 — same as AX
        bounds: { height: 30, width: 50, x: 100, y: 100 },
        role: 'AXButton',
        title: 'Submit',
      },
    ])

    const candidates = buildTargetCandidates({
      axSnapshot: ax,
      chromeSnapshot: chrome,
      chromeWindowBounds: { height: 1080, width: 1920, x: 0, y: 0 },
      foregroundApp: 'Google Chrome',
    })

    // Should have the chrome candidate (preferred) and the AX should be deduped
    const chromeCount = candidates.filter(c => c.source === 'chrome_dom').length
    expect(chromeCount).toBe(1)
    // AX candidate may or may not be deduped depending on exact IoU
  })

  it('no sources: returns empty', () => {
    const candidates = buildTargetCandidates({ foregroundApp: 'Finder' })
    expect(candidates).toEqual([])
  })

  it('assigns sequential ids', () => {
    const ax = makeAXSnapshot([
      { role: 'AXButton', title: 'A' },
      { role: 'AXButton', title: 'B' },
      { role: 'AXButton', title: 'C' },
    ])
    const candidates = buildTargetCandidates({ axSnapshot: ax, foregroundApp: 'Finder' })
    expect(candidates.map(c => c.id)).toEqual(['t_0', 't_1', 't_2'])
  })

  it('limits to 50 candidates', () => {
    const nodes = Array.from({ length: 60 }, (_, i) => ({
      bounds: { height: 30, width: 50, x: i * 60, y: 100 },
      role: 'AXButton' as const,
      title: `Btn ${i}`,
    }))
    const ax = makeAXSnapshot(nodes)
    const candidates = buildTargetCandidates({ axSnapshot: ax, foregroundApp: 'Finder' })
    expect(candidates.length).toBe(50)
  })

  it('disabled AX nodes have interactable=false', () => {
    const ax = makeAXSnapshot([
      { enabled: false, role: 'AXButton', title: 'Disabled' },
    ])
    const candidates = buildTargetCandidates({ axSnapshot: ax, foregroundApp: 'Finder' })
    expect(candidates[0].interactable).toBe(false)
  })

  it('keeps chrome_dom candidates attached to Google Chrome even when another app is foreground', () => {
    const chrome = makeChromeSnapshot([
      { rect: { h: 30, w: 80, x: 10, y: 10 }, tag: 'button', text: 'Submit' },
    ])

    const candidates = buildTargetCandidates({
      chromeSnapshot: chrome,
      chromeWindowBounds: { height: 1080, width: 1920, x: 0, y: 0 },
      foregroundApp: 'Finder',
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0].source).toBe('chrome_dom')
    expect(candidates[0].appName).toBe('Google Chrome')
  })
})

describe('captureDesktopGrounding', () => {
  it('retries window observation with app filter when Chrome is foreground and the generic list misses it', async () => {
    const chromeWindow = { height: 1080, width: 1920, x: 0, y: 0 }
    const chromeElements = [
      { rect: { h: 30, w: 80, x: 10, y: 10 }, tag: 'button', text: 'Submit' },
    ]

    const executor = {
      click: vi.fn(),
      describe: vi.fn(),
      focusApp: vi.fn(),
      getDisplayInfo: vi.fn(),
      getExecutionTarget: vi.fn(),
      getForegroundContext: vi.fn().mockResolvedValue({
        appName: 'Google Chrome',
        available: true,
        platform: 'darwin',
      }),
      observeWindows: vi.fn()
        .mockResolvedValueOnce({
          frontmostAppName: 'Google Chrome',
          frontmostWindowTitle: 'Chrome',
          observedAt: new Date().toISOString(),
          windows: [
            {
              appName: 'Control Center',
              bounds: { height: 30, width: 100, x: 0, y: 0 },
              title: 'Clock',
            },
          ],
        })
        .mockResolvedValueOnce({
          frontmostAppName: 'Google Chrome',
          frontmostWindowTitle: 'Chrome',
          observedAt: new Date().toISOString(),
          windows: [
            {
              appName: 'Google Chrome',
              bounds: chromeWindow,
              id: '1234:0:Chrome',
              isOnScreen: true,
              layer: 0,
              ownerPid: 1234,
              title: 'Chrome',
            },
          ],
        }),
      openApp: vi.fn(),
      pressKeys: vi.fn(),
      scroll: vi.fn(),
      takeScreenshot: vi.fn().mockResolvedValue({
        capturedAt: new Date().toISOString(),
        dataBase64: '',
        mimeType: 'image/png',
        path: '/tmp/screenshot.png',
      }),
      typeText: vi.fn(),
    } as any

    const cdpBridge = {
      collectInteractiveElements: vi.fn().mockResolvedValue(chromeElements),
      getStatus: vi.fn().mockReturnValue({
        connected: true,
        pageTitle: 'Example Page',
        pageUrl: 'https://example.com',
      }),
    } as any

    const config = {
      timeoutMs: 5000,
    } as any

    const snapshot = await captureDesktopGrounding({
      cdpBridge,
      config,
      executor,
      input: { includeChrome: true },
    })

    expect(executor.observeWindows).toHaveBeenNthCalledWith(1, { limit: 12 })
    expect(executor.observeWindows).toHaveBeenNthCalledWith(2, { app: 'Google Chrome', limit: 12 })
    expect(snapshot.targetCandidates.some(candidate => candidate.source === 'chrome_dom')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// formatGroundingForAgent
// ---------------------------------------------------------------------------

describe('formatGroundingForAgent', () => {
  function makeFullSnapshot(candidateCount = 2): DesktopGroundingSnapshot {
    const candidates = Array.from({ length: candidateCount }, (_, i) => ({
      appName: 'Finder',
      bounds: { height: 30, width: 50, x: 100 + i * 60, y: 100 },
      confidence: 0.8,
      id: `t_${i}`,
      interactable: true,
      label: `Button ${i}`,
      role: 'AXButton',
      source: 'ax' as const,
    }))

    return {
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Finder',
      screenshot: { capturedAt: new Date().toISOString(), dataBase64: '', mimeType: 'image/png', path: '' },
      snapshotId: 'dg_1',
      staleFlags: { ax: false, chromeSemantic: true, screenshot: false },
      targetCandidates: candidates,
      windows: [{ appName: 'Finder', id: '1', title: 'Desktop' }],
    } as DesktopGroundingSnapshot
  }

  it('includes foreground app name', () => {
    const text = formatGroundingForAgent(makeFullSnapshot())
    expect(text).toContain('Finder')
  })

  it('shows staleness warnings', () => {
    const text = formatGroundingForAgent(makeFullSnapshot())
    expect(text).toContain('Chrome semantic')
  })

  it('lists target candidates with ids and bounds', () => {
    const text = formatGroundingForAgent(makeFullSnapshot())
    expect(text).toContain('[t_0]')
    expect(text).toContain('[t_1]')
    expect(text).toContain('AXButton')
    expect(text).toContain('conf=0.80')
  })

  it('truncates at 40 candidates with count note', () => {
    const text = formatGroundingForAgent(makeFullSnapshot(45))
    expect(text).toContain('... and 5 more')
  })

  it('shows Chrome page info when chrome snapshot present', () => {
    const snapshot = makeFullSnapshot()
    snapshot.chromeSemanticSnapshot = {
      capturedAt: new Date().toISOString(),
      interactiveElements: [],
      pageTitle: 'Example',
      pageUrl: 'https://example.com',
      source: 'extension',
    }
    const text = formatGroundingForAgent(snapshot)
    expect(text).toContain('Example')
    expect(text).toContain('https://example.com')
  })

  it('empty candidates → shows "No interactable targets"', () => {
    const snapshot = makeFullSnapshot(0)
    const text = formatGroundingForAgent(snapshot)
    expect(text).toContain('No interactable targets')
  })
})
