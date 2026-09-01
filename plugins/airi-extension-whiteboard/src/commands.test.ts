import type { GameletHandle } from '@proj-airi/plugin-sdk-stage/kits/gamelet'
import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'

import { describe, expect, it, vi } from 'vitest'

import { executeWhiteboardCommand } from './commands'
import { WhiteboardStore } from './model'
import { createWhiteboardTools } from './tools'

describe('executeWhiteboardCommand', () => {
  it('supports every registered whiteboard command', () => {
    const store = new WhiteboardStore()
    const created = executeWhiteboardCommand(store, { type: 'create_canvas', name: 'Plan' })
    const canvas = created.canvas as HostDataRecord
    const canvasId = canvas.id as string

    expect(executeWhiteboardCommand(store, { type: 'list_canvases' }).canvases).toHaveLength(1)
    expect(executeWhiteboardCommand(store, { type: 'get_canvas', canvasId }).canvas).toMatchObject({ id: canvasId })

    const path = executeWhiteboardCommand(store, {
      type: 'add_path',
      canvasId,
      points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
    }).path as HostDataRecord
    expect(executeWhiteboardCommand(store, { type: 'remove_path', canvasId, pathId: path.id as string })).toEqual({ removed: true })

    expect(executeWhiteboardCommand(store, { type: 'add_text', canvasId, value: 'Label', x: 10, y: 20 }).text).toMatchObject({ value: 'Label' })
    expect(executeWhiteboardCommand(store, { type: 'undo' })).toEqual({ changed: true })
    expect(executeWhiteboardCommand(store, { type: 'redo' })).toEqual({ changed: true })
    expect(executeWhiteboardCommand(store, { type: 'delete_canvas', canvasId })).toEqual({ activeCanvasId: null, deleted: true })
  })

  it('returns useful validation errors to the invoking host', () => {
    const store = new WhiteboardStore()

    expect(() => executeWhiteboardCommand(store, { type: 'add_path', points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] })).toThrow('A canvas must be selected first.')
    expect(() => executeWhiteboardCommand(store, { type: 'missing_command' })).toThrow('Unsupported whiteboard command')
  })
})

describe('createWhiteboardTools', () => {
  it('keeps the nine tool names and delegates each invocation through the gamelet', async () => {
    const open = vi.fn(async () => {})
    const request = vi.fn(async (payload: HostDataRecord) => payload)
    const gamelet: GameletHandle = {
      id: 'main',
      bindingId: 'whiteboard:main',
      open,
      configure: async () => {},
      request: async <TResponse = HostDataRecord>(payload: HostDataRecord) => await request(payload) as TResponse,
      close: async () => {},
      isOpen: async () => false,
    }
    const tools = createWhiteboardTools(gamelet)

    expect(tools.map(tool => tool.id)).toEqual([
      'create_canvas',
      'list_canvases',
      'get_canvas',
      'delete_canvas',
      'add_path',
      'remove_path',
      'add_text',
      'undo',
      'redo',
    ])

    await expect(tools[0]!.execute({ name: 'Plan' })).resolves.toEqual({ type: 'create_canvas', name: 'Plan' })
    expect(open).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledWith({ type: 'create_canvas', name: 'Plan' })
  })
})
