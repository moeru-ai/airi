import type { AXSnapshot } from './accessibility/types'
import type { DesktopExecutor, WindowObservation } from './types'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { captureDesktopGrounding } from './desktop-grounding'

const { captureAXTreeMock, captureChromeSemanticsMock } = vi.hoisted(() => ({
  captureAXTreeMock: vi.fn(),
  captureChromeSemanticsMock: vi.fn(),
}))

vi.mock('./accessibility', () => ({
  captureAXTree: captureAXTreeMock,
}))

vi.mock('./chrome-semantic-adapter', async () => {
  const actual = await vi.importActual<typeof import('./chrome-semantic-adapter')>('./chrome-semantic-adapter')
  return {
    ...actual,
    captureChromeSemantics: captureChromeSemanticsMock,
  }
})

function makeAxSnapshot(): AXSnapshot {
  const root = {
    uid: 'root',
    role: 'AXApplication',
    title: 'AIRI',
    children: [],
  }

  return {
    snapshotId: 'ax_1',
    pid: 123,
    appName: 'AIRI',
    root,
    uidToNode: new Map([['root', root]]),
    capturedAt: new Date().toISOString(),
    maxDepth: 1,
    truncated: false,
  } as AXSnapshot
}

describe('captureDesktopGrounding', () => {
  beforeEach(() => {
    captureAXTreeMock.mockReset()
    captureChromeSemanticsMock.mockReset()
  })

  it('does not project Chrome semantics onto non-Chrome windows that only share the same title', async () => {
    captureAXTreeMock.mockResolvedValue(makeAxSnapshot())
    captureChromeSemanticsMock.mockResolvedValue({
      pageUrl: 'https://example.com',
      pageTitle: 'Shared Title',
      interactiveElements: [
        {
          tag: 'button',
          text: 'Submit',
          rect: { x: 20, y: 20, w: 80, h: 30 },
        },
      ],
      capturedAt: new Date().toISOString(),
      source: 'extension',
    })

    const genericObservation: WindowObservation = {
      frontmostAppName: 'AIRI',
      windows: [
        {
          id: 'airi:1',
          appName: 'AIRI',
          title: 'Shared Title',
          bounds: { x: 10, y: 20, width: 1200, height: 800 },
        },
      ],
      observedAt: new Date().toISOString(),
    }

    const chromeObservation: WindowObservation = {
      windows: [],
      observedAt: new Date().toISOString(),
    }

    const observeWindows = vi.fn()
      .mockResolvedValueOnce(genericObservation)
      .mockResolvedValueOnce(chromeObservation)

    const executor = {
      takeScreenshot: vi.fn().mockResolvedValue({
        dataBase64: '',
        mimeType: 'image/png',
        path: '',
        capturedAt: new Date().toISOString(),
      }),
      observeWindows,
    } as unknown as DesktopExecutor

    const snapshot = await captureDesktopGrounding({
      config: {} as never,
      executor,
      input: { includeChrome: true },
    })

    expect(snapshot.targetCandidates.some(candidate => candidate.source === 'chrome_dom')).toBe(false)
  })
})
