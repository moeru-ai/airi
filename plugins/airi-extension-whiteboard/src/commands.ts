import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'

import type { WhiteboardStore } from './model'

/** Commands accepted by the whiteboard UI state owner. */
export type WhiteboardCommand
  = | ({ type: 'create_canvas', name?: string, width?: number, height?: number, background?: string } & HostDataRecord)
    | ({ type: 'list_canvases' } & HostDataRecord)
    | ({ type: 'get_canvas', canvasId?: string } & HostDataRecord)
    | ({ type: 'delete_canvas', canvasId: string } & HostDataRecord)
    | ({ type: 'add_path', canvasId?: string, points: Array<{ x: number, y: number }>, color?: string, width?: number } & HostDataRecord)
    | ({ type: 'remove_path', canvasId?: string, pathId: string } & HostDataRecord)
    | ({ type: 'add_text', canvasId?: string, value: string, x: number, y: number, color?: string, fontSize?: number } & HostDataRecord)
    | ({ type: 'undo' } & HostDataRecord)
    | ({ type: 'redo' } & HostDataRecord)

function getString(input: HostDataRecord, key: string, required: true): string
function getString(input: HostDataRecord, key: string, required?: false): string | undefined
function getString(input: HostDataRecord, key: string, required = false) {
  const value = input[key]
  if (typeof value === 'string') {
    return value
  }
  if (required) {
    throw new Error(`\`${key}\` must be a string.`)
  }
  return undefined
}

function getNumber(input: HostDataRecord, key: string) {
  const value = input[key]
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`\`${key}\` must be a finite number.`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getPoints(input: HostDataRecord) {
  const value = input.points
  if (!Array.isArray(value)) {
    throw new TypeError('`points` must be an array.')
  }
  return value.map((point) => {
    if (!isRecord(point) || typeof point.x !== 'number' || typeof point.y !== 'number') {
      throw new Error('Each point must contain finite `x` and `y` numbers.')
    }
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new TypeError('Each point must contain finite `x` and `y` numbers.')
    }
    return { x: point.x, y: point.y }
  })
}

/** Runs one tool or UI command against the shared whiteboard state. */
export function executeWhiteboardCommand(store: WhiteboardStore, input: HostDataRecord): HostDataRecord {
  const type = getString(input, 'type', true)
  switch (type) {
    case 'create_canvas': {
      const canvas = store.createCanvas({
        name: getString(input, 'name'),
        width: getNumber(input, 'width'),
        height: getNumber(input, 'height'),
        background: getString(input, 'background'),
      })
      return { canvas }
    }
    case 'list_canvases':
      return { activeCanvasId: store.document.activeCanvasId ?? null, canvases: store.document.canvases }
    case 'get_canvas': {
      const canvasId = getString(input, 'canvasId')
      const canvas = store.document.canvases.find(item => item.id === (canvasId ?? store.document.activeCanvasId))
      if (!canvas) {
        throw new Error('Canvas was not found.')
      }
      return { canvas }
    }
    case 'delete_canvas':
      store.deleteCanvas(getString(input, 'canvasId', true))
      return { activeCanvasId: store.document.activeCanvasId ?? null, deleted: true }
    case 'add_path': {
      const path = store.addPath({
        canvasId: getString(input, 'canvasId'),
        points: getPoints(input),
        color: getString(input, 'color'),
        width: getNumber(input, 'width'),
      })
      return { path }
    }
    case 'remove_path':
      store.removePath({ canvasId: getString(input, 'canvasId'), pathId: getString(input, 'pathId', true) })
      return { removed: true }
    case 'add_text': {
      const text = store.addText({
        canvasId: getString(input, 'canvasId'),
        value: getString(input, 'value', true),
        x: getNumber(input, 'x') ?? 0,
        y: getNumber(input, 'y') ?? 0,
        color: getString(input, 'color'),
        fontSize: getNumber(input, 'fontSize'),
      })
      return { text }
    }
    case 'undo':
      return { changed: store.undo() }
    case 'redo':
      return { changed: store.redo() }
    default:
      throw new Error(`Unsupported whiteboard command: ${type}`)
  }
}
