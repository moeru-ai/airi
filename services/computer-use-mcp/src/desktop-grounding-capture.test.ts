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
    children: [],
    role: 'AXApplication',
    title: 'AIRI',
    uid: 'root',
  }

  return {
    appName: 'AIRI',
    capturedAt: new Date().toISOString(),
    maxDepth: 1,
    pid: 123,
    root,
    snapshotId: 'ax_1',
    truncated: false,
    uidToNode: new Map([['root', root]]),
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
      capturedAt: new Date().toISOString(),
      interactiveElements: [
        {
          rect: { h: 30, w: 80, x: 20, y: 20 },
          tag: 'button',
          text: 'Submit',
        },
      ],
      pageTitle: 'Shared Title',
      pageUrl: 'https://example.com',
      source: 'extension',
    })

    const genericObservation: WindowObservation = {
      frontmostAppName: 'AIRI',
      observedAt: new Date().toISOString(),
      windows: [
        {
          appName: 'AIRI',
          bounds: { height: 800, width: 1200, x: 10, y: 20 },
          id: 'airi:1',
          title: 'Shared Title',
        },
      ],
    }

    const chromeObservation: WindowObservation = {
      observedAt: new Date().toISOString(),
      windows: [],
    }

    const observeWindows = vi.fn()
      .mockResolvedValueOnce(genericObservation)
      .mockResolvedValueOnce(chromeObservation)

    const executor = {
      observeWindows,
      takeScreenshot: vi.fn().mockResolvedValue({
        capturedAt: new Date().toISOString(),
        dataBase64: '',
        mimeType: 'image/png',
        path: '',
      }),
    } as unknown as DesktopExecutor

    const snapshot = await captureDesktopGrounding({
      config: {} as never,
      executor,
      input: { includeChrome: true },
    })

    expect(snapshot.targetCandidates.some(candidate => candidate.source === 'chrome_dom')).toBe(false)
  })
})
