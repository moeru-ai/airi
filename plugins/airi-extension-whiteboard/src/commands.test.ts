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

  // https://github.com/moeru-ai/airi/pull/2441#discussion_r3912253467
  it('treats nullable optional numeric arguments as missing', () => {
    const store = new WhiteboardStore()
    const created = executeWhiteboardCommand(store, {
      type: 'create_canvas',
      name: 'Nullable defaults',
      width: null,
      height: null,
    }).canvas as HostDataRecord
    const canvasId = created.id as string

    expect(created.width).toBe(1200)
    expect(created.height).toBe(800)

    const path = executeWhiteboardCommand(store, {
      type: 'add_path',
      canvasId,
      points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
      width: null,
    }).path as HostDataRecord
    expect(path.width).toBe(4)

    const text = executeWhiteboardCommand(store, {
      type: 'add_text',
      canvasId,
      value: 'Default size',
      x: 10,
      y: 20,
      fontSize: null,
    }).text as HostDataRecord
    expect(text.fontSize).toBe(28)
  })

  // https://github.com/moeru-ai/airi/pull/2441#discussion_r3914212204
  it('rejects non-positive canvas dimensions before saving the canvas', () => {
    const store = new WhiteboardStore()

    expect(() => executeWhiteboardCommand(store, { type: 'create_canvas', width: 0 })).toThrow('`width` must be a finite positive number.')
    expect(() => executeWhiteboardCommand(store, { type: 'create_canvas', width: -1 })).toThrow('`width` must be a finite positive number.')
    expect(() => executeWhiteboardCommand(store, { type: 'create_canvas', height: 0 })).toThrow('`height` must be a finite positive number.')
    expect(() => executeWhiteboardCommand(store, { type: 'create_canvas', height: -1 })).toThrow('`height` must be a finite positive number.')
    expect(store.document.canvases).toHaveLength(0)
  })
})

describe('createWhiteboardTools', () => {
  it('declares positive canvas dimensions in the tool schema', () => {
    const gamelet = {
      id: 'main',
      bindingId: 'whiteboard:main',
      open: async () => {},
      configure: async () => {},
      request: async <TResponse = HostDataRecord>() => ({}) as TResponse,
      close: async () => {},
      isOpen: async () => false,
    } satisfies GameletHandle
    const schema = createWhiteboardTools(gamelet)[0]!.inputSchema as HostDataRecord
    const properties = schema.properties as HostDataRecord

    expect(properties.width).toEqual({ type: 'number', exclusiveMinimum: 0 })
    expect(properties.height).toEqual({ type: 'number', exclusiveMinimum: 0 })
  })

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
