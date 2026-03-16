import type { DesktopScene } from './types'

import { describe, expect, it } from 'vitest'

import { DesktopIntentService } from './intent-service'

function createScene(overrides: Partial<DesktopScene> = {}): DesktopScene {
  return {
    capturedAt: '2026-01-01T00:00:00.000Z',
    screens: [{
      id: 'screen:1',
      bounds: { x: 0, y: 0, width: 1200, height: 800 },
    }],
    windows: [
      {
        id: 'w-editor',
        appName: 'Cursor',
        title: 'repo',
        bounds: { x: 0, y: 0, width: 700, height: 800 },
        focused: true,
        zIndex: 10,
        screenId: 'screen:1',
      },
      {
        id: 'w-terminal',
        appName: 'Terminal',
        title: 'zsh',
        bounds: { x: 700, y: 0, width: 500, height: 400 },
        focused: false,
        zIndex: 11,
        screenId: 'screen:1',
      },
      {
        id: 'w-unknown',
        appName: 'RandomApp',
        title: 'random',
        bounds: { x: 700, y: 400, width: 500, height: 400 },
        focused: false,
        zIndex: 12,
        screenId: 'screen:1',
      },
    ],
    pointer: { x: 10, y: 10 },
    focusedApp: 'Cursor',
    focusedWindowId: 'w-editor',
    ...overrides,
  }
}

describe('desktopIntentService', () => {
  it('assigns explicit windowIds in caller order to preset slot order', () => {
    const service = new DesktopIntentService()
    const scene = createScene()

    const preview = service.previewLayout(scene, 'coding-dual-pane', ['w-terminal', 'w-editor'])

    expect(preview.targets.map(target => target.windowId)).toEqual(['w-terminal', 'w-editor'])
    expect(preview.notes).toContain('explicit_window_ids_assigned_by_caller_order')
  })

  it('keeps zero-score windows unresolved in auto matching mode', () => {
    const service = new DesktopIntentService()
    const scene = createScene()

    const preview = service.previewLayout(scene, 'coding-dual-pane')

    expect(preview.targets.some(target => target.windowId === 'w-unknown')).toBe(false)
    expect(preview.unresolvedWindowIds).toContain('w-unknown')
    expect(preview.notes).toContain('auto_matching_requires_positive_hint_score')
  })

  it('marks missing explicit window ids as unresolved', () => {
    const service = new DesktopIntentService()
    const scene = createScene()

    const preview = service.previewLayout(scene, 'review-mode', ['w-editor', 'w-missing'])

    expect(preview.targets.map(target => target.windowId)).toEqual(['w-editor'])
    expect(preview.unresolvedWindowIds).toContain('w-missing')
  })
})
