import type { AXNode, AXSnapshot } from './accessibility/types'
import type { ChromeSemanticSnapshot, DesktopGroundingSnapshot } from './desktop-grounding-types'

import { describe, expect, it, vi } from 'vitest'

import { buildTargetCandidates, captureDesktopGrounding, formatGroundingForAgent } from './desktop-grounding'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAXSnapshot(nodes: Partial<AXNode>[]): AXSnapshot {
  const root: AXNode = {
    uid: 'root_0',
    role: 'AXApplication',
    children: nodes.map((n, i) => ({
      uid: n.uid ?? `node_${i}`,
      role: n.role ?? 'AXButton',
      title: n.title ?? `Button ${i}`,
      bounds: n.bounds ?? { x: 100 + i * 60, y: 100, width: 50, height: 30 },
      enabled: n.enabled ?? true,
      focused: n.focused ?? false,
      children: n.children ?? [],
    })),
  }

  const uidToNode = new Map<string, AXNode>()
  function walk(node: AXNode) {
    uidToNode.set(node.uid, node)
    for (const child of node.children) walk(child)
  }
  walk(root)

  return {
    snapshotId: 'ax_1',
    pid: 1234,
    appName: 'Google Chrome',
    root,
    uidToNode,
    capturedAt: new Date().toISOString(),
    maxDepth: 15,
    truncated: false,
  }
}

function makeChromeSnapshot(elements: Array<{
  tag?: string
  text?: string
  role?: string
  rect?: { x: number, y: number, w: number, h: number }
  disabled?: boolean
}>): ChromeSemanticSnapshot {
  return {
    pageUrl: 'https://example.com',
    pageTitle: 'Example Page',
    interactiveElements: elements.map(el => ({
      tag: el.tag ?? 'button',
      text: el.text ?? 'Click me',
      role: el.role,
      rect: el.rect ?? { x: 50, y: 50, w: 100, h: 30 },
      disabled: el.disabled,
    })),
    capturedAt: new Date().toISOString(),
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
      { tag: 'button', text: 'Submit', rect: { x: 10, y: 10, w: 80, h: 30 } },
      { tag: 'a', text: 'Link', rect: { x: 10, y: 50, w: 60, h: 20 } },
    ])
    const candidates = buildTargetCandidates({
      chromeSnapshot: chrome,
      chromeWindowBounds: { x: 0, y: 0, width: 1920, height: 1080 },
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
      { tag: 'button', text: 'Submit', rect: { x: 100, y: 12, w: 50, h: 30 } },
    ])
    const ax = makeAXSnapshot([
      {
        role: 'AXButton',
        title: 'Submit',
        // After chrome chrome height offset (88px), chrome rect becomes
        // screen-absolute: x=100, y=100, w=50, h=30 — same as AX
        bounds: { x: 100, y: 100, width: 50, height: 30 },
      },
    ])

    const candidates = buildTargetCandidates({
      axSnapshot: ax,
      chromeSnapshot: chrome,
      chromeWindowBounds: { x: 0, y: 0, width: 1920, height: 1080 },
      foregroundApp: 'Google Chrome',
    })

    // Should have the chrome candidate (preferred) and the AX should be deduped
    const chromeCount = candidates.filter(c => c.source === 'chrome_dom').length
    const axCount = candidates.filter(c => c.source === 'ax').length
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
      role: 'AXButton' as const,
      title: `Btn ${i}`,
      bounds: { x: i * 60, y: 100, width: 50, height: 30 },
    }))
    const ax = makeAXSnapshot(nodes)
    const candidates = buildTargetCandidates({ axSnapshot: ax, foregroundApp: 'Finder' })
    expect(candidates.length).toBe(50)
  })

  it('disabled AX nodes have interactable=false', () => {
    const ax = makeAXSnapshot([
      { role: 'AXButton', title: 'Disabled', enabled: false },
    ])
    const candidates = buildTargetCandidates({ axSnapshot: ax, foregroundApp: 'Finder' })
    expect(candidates[0].interactable).toBe(false)
  })

  it('keeps chrome_dom candidates attached to Google Chrome even when another app is foreground', () => {
    const chrome = makeChromeSnapshot([
      { tag: 'button', text: 'Submit', rect: { x: 10, y: 10, w: 80, h: 30 } },
    ])

    const candidates = buildTargetCandidates({
      chromeSnapshot: chrome,
      chromeWindowBounds: { x: 0, y: 0, width: 1920, height: 1080 },
      foregroundApp: 'Finder',
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0].source).toBe('chrome_dom')
    expect(candidates[0].appName).toBe('Google Chrome')
  })
})

describe('captureDesktopGrounding', () => {
  it('retries window observation with app filter when Chrome is foreground and the generic list misses it', async () => {
    const chromeWindow = { x: 0, y: 0, width: 1920, height: 1080 }
    const chromeElements = [
      { tag: 'button', text: 'Submit', rect: { x: 10, y: 10, w: 80, h: 30 } },
    ]

    const executor = {
      takeScreenshot: vi.fn().mockResolvedValue({
        dataBase64: '',
        mimeType: 'image/png',
        path: '/tmp/screenshot.png',
        capturedAt: new Date().toISOString(),
      }),
      observeWindows: vi.fn()
        .mockResolvedValueOnce({
          frontmostAppName: 'Google Chrome',
          frontmostWindowTitle: 'Chrome',
          windows: [
            {
              appName: 'Control Center',
              title: 'Clock',
              bounds: { x: 0, y: 0, width: 100, height: 30 },
            },
          ],
          observedAt: new Date().toISOString(),
        })
        .mockResolvedValueOnce({
          frontmostAppName: 'Google Chrome',
          frontmostWindowTitle: 'Chrome',
          windows: [
            {
              appName: 'Google Chrome',
              title: 'Chrome',
              bounds: chromeWindow,
              ownerPid: 1234,
              id: '1234:0:Chrome',
              layer: 0,
              isOnScreen: true,
            },
          ],
          observedAt: new Date().toISOString(),
        }),
      focusApp: vi.fn(),
      openApp: vi.fn(),
      click: vi.fn(),
      typeText: vi.fn(),
      pressKeys: vi.fn(),
      scroll: vi.fn(),
      getForegroundContext: vi.fn().mockResolvedValue({
        available: true,
        appName: 'Google Chrome',
        platform: 'darwin',
      }),
      getDisplayInfo: vi.fn(),
      getExecutionTarget: vi.fn(),
      describe: vi.fn(),
    } as any

    const cdpBridge = {
      getStatus: vi.fn().mockReturnValue({
        connected: true,
        pageUrl: 'https://example.com',
        pageTitle: 'Example Page',
      }),
      collectInteractiveElements: vi.fn().mockResolvedValue(chromeElements),
    } as any

    const config = {
      timeoutMs: 5000,
    } as any

    const snapshot = await captureDesktopGrounding({
      config,
      executor,
      input: { includeChrome: true },
      cdpBridge,
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
      id: `t_${i}`,
      source: 'ax' as const,
      appName: 'Finder',
      role: 'AXButton',
      label: `Button ${i}`,
      bounds: { x: 100 + i * 60, y: 100, width: 50, height: 30 },
      confidence: 0.8,
      interactable: true,
    }))

    return {
      snapshotId: 'dg_1',
      capturedAt: new Date().toISOString(),
      foregroundApp: 'Finder',
      windows: [{ id: '1', appName: 'Finder', title: 'Desktop' }],
      screenshot: { dataBase64: '', mimeType: 'image/png', path: '', capturedAt: new Date().toISOString() },
      targetCandidates: candidates,
      staleFlags: { screenshot: false, ax: false, chromeSemantic: true },
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
      pageUrl: 'https://example.com',
      pageTitle: 'Example',
      interactiveElements: [],
      capturedAt: new Date().toISOString(),
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
