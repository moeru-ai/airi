import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { ExecuteAction } from '../server/action-executor'
import type { DesktopScene } from './types'

import { describe, expect, it, vi } from 'vitest'

import { DesktopActionService } from './action-service'

function createScene(): DesktopScene {
  return {
    capturedAt: '2026-01-01T00:00:00.000Z',
    screens: [{
      id: 'screen:1',
      bounds: { x: 0, y: 0, width: 1200, height: 800 },
    }],
    windows: [{
      id: 'w-editor',
      appName: 'Cursor',
      title: 'repo',
      bounds: { x: 0, y: 0, width: 700, height: 800 },
      focused: true,
      zIndex: 10,
      screenId: 'screen:1',
    }],
    pointer: { x: 10, y: 10 },
    focusedApp: 'Cursor',
    focusedWindowId: 'w-editor',
  }
}

function success(actionKind: string): CallToolResult {
  return {
    content: [{ type: 'text', text: `${actionKind} ok` }],
    structuredContent: {
      status: 'executed',
      action: actionKind,
    },
  }
}

describe('desktopActionService', () => {
  it('focuses window via focus_window action with skipApprovalQueue', async () => {
    const executeAction = vi.fn(async action => success(action.kind)) as unknown as ExecuteAction
    const service = new DesktopActionService(executeAction)
    const scene = createScene()

    const result = await service.focusWindow(scene, 'w-editor')

    expect(result.status).toBe('completed')
    expect(executeAction).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'focus_window',
      input: expect.objectContaining({
        observedBounds: scene.windows[0]?.bounds,
      }),
    }), 'desktop_focus_window', expect.objectContaining({
      skipApprovalQueue: true,
    }))
  })

  it('maps set_window_bounds unsupported to unsupported status', async () => {
    const executeAction = vi.fn(async (action) => {
      if (action.kind === 'set_window_bounds') {
        return {
          isError: true,
          content: [{ type: 'text', text: 'set_window_bounds unsupported' }],
        } satisfies CallToolResult
      }
      return success(action.kind)
    }) as unknown as ExecuteAction

    const service = new DesktopActionService(executeAction)
    const result = await service.moveResizeWindow(createScene(), 'w-editor', {
      x: 20,
      y: 20,
      width: 600,
      height: 700,
    })

    expect(result.status).toBe('unsupported')
  })

  it('passes observedBounds separately from target bounds when resizing', async () => {
    const executeAction = vi.fn(async action => success(action.kind)) as unknown as ExecuteAction
    const service = new DesktopActionService(executeAction)
    const scene = createScene()
    const nextBounds = {
      x: 20,
      y: 20,
      width: 600,
      height: 700,
    }

    const result = await service.moveResizeWindow(scene, 'w-editor', nextBounds)

    expect(result.status).toBe('completed')
    expect(executeAction).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'set_window_bounds',
      input: expect.objectContaining({
        bounds: nextBounds,
        observedBounds: scene.windows[0]?.bounds,
      }),
    }), 'desktop_move_resize_window', expect.objectContaining({
      skipApprovalQueue: true,
    }))
  })

  it('returns unsupported plan status when move/resize is unsupported', async () => {
    const executeAction = vi.fn(async (action) => {
      if (action.kind === 'set_window_bounds') {
        return {
          isError: true,
          content: [{ type: 'text', text: 'set_window_bounds unsupported' }],
        } satisfies CallToolResult
      }
      return success(action.kind)
    }) as unknown as ExecuteAction

    const service = new DesktopActionService(executeAction)
    const result = await service.runActionPlan(createScene(), {
      id: 'p1',
      createdAt: '2026-01-01T00:00:00.000Z',
      steps: [{
        kind: 'move_resize_window',
        windowId: 'w-editor',
        bounds: { x: 10, y: 10, width: 600, height: 700 },
      }],
    })

    expect(result.status).toBe('unsupported')
    expect(result.errors[0]).toContain('set_window_bounds_unsupported')
  })
})
