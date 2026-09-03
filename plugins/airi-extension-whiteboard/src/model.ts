import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'

import { nanoid } from 'nanoid/non-secure'

/** One point in the whiteboard SVG coordinate system. */
export interface WhiteboardPoint extends HostDataRecord {
  x: number
  y: number
}

/** A freehand SVG path. */
export interface WhiteboardPath extends HostDataRecord {
  id: string
  color: string
  width: number
  points: WhiteboardPoint[]
}

/** A text item rendered inside a whiteboard SVG. */
export interface WhiteboardText extends HostDataRecord {
  id: string
  value: string
  x: number
  y: number
  color: string
  fontSize: number
}

/** A locally stored whiteboard canvas. */
export interface WhiteboardCanvas extends HostDataRecord {
  id: string
  name: string
  width: number
  height: number
  background: string
  paths: WhiteboardPath[]
  texts: WhiteboardText[]
  createdAt: number
  updatedAt: number
}

/** Persisted whiteboard state for one extension installation. */
export interface WhiteboardDocument {
  schemaVersion: 1
  activeCanvasId?: string
  canvases: WhiteboardCanvas[]
}

/** Creates an empty whiteboard document. */
export function createWhiteboardDocument(): WhiteboardDocument {
  return { schemaVersion: 1, canvases: [] }
}

/** Creates one SVG canvas with default dimensions and colors. */
export function createCanvas(input: {
  name?: string
  width?: number
  height?: number
  background?: string
  now?: number
} = {}): WhiteboardCanvas {
  const now = input.now ?? Date.now()
  const width = input.width ?? 1200
  const height = input.height ?? 800
  if (!Number.isFinite(width) || width <= 0) {
    throw new TypeError('`width` must be a finite positive number.')
  }
  if (!Number.isFinite(height) || height <= 0) {
    throw new TypeError('`height` must be a finite positive number.')
  }
  return {
    id: nanoid(),
    name: input.name?.trim() || 'Untitled canvas',
    width,
    height,
    background: input.background ?? '#ffffff',
    paths: [],
    texts: [],
    createdAt: now,
    updatedAt: now,
  }
}

function cloneDocument(document: WhiteboardDocument): WhiteboardDocument {
  return structuredClone(document)
}

function activeCanvasOrThrow(document: WhiteboardDocument, canvasId?: string) {
  const id = canvasId ?? document.activeCanvasId
  const canvas = document.canvases.find(item => item.id === id)
  if (!canvas) {
    throw new Error('A canvas must be selected first.')
  }
  return canvas
}

/**
 * Owns mutable whiteboard state and the undo/redo snapshots for one UI.
 *
 * The UI and extension tools call this class. It gives both input paths one
 * local source of truth and persists only committed document snapshots.
 */
export class WhiteboardStore {
  private history: WhiteboardDocument[]
  private historyIndex: number

  constructor(document: WhiteboardDocument = createWhiteboardDocument()) {
    this.history = [cloneDocument(document)]
    this.historyIndex = 0
  }

  get document() {
    return cloneDocument(this.history[this.historyIndex]!)
  }

  get activeCanvas() {
    const id = this.history[this.historyIndex]!.activeCanvasId
    return this.history[this.historyIndex]!.canvases.find(canvas => canvas.id === id)
  }

  replace(document: WhiteboardDocument) {
    this.history = [cloneDocument(document)]
    this.historyIndex = 0
  }

  /**
   * Runs one change and restores the prior history if it throws.
   *
   * Use this method when storage must save a change before the UI reports success.
   */
  transact<T>(operation: () => T): T {
    const history = this.history
    const historyIndex = this.historyIndex
    try {
      return operation()
    }
    catch (error) {
      this.history = history
      this.historyIndex = historyIndex
      throw error
    }
  }

  createCanvas(input: Parameters<typeof createCanvas>[0] = {}) {
    const canvas = createCanvas(input)
    this.commit((document) => {
      document.canvases.push(canvas)
      document.activeCanvasId = canvas.id
    })
    return canvas
  }

  selectCanvas(canvasId: string) {
    this.commit((document) => {
      activeCanvasOrThrow(document, canvasId)
      document.activeCanvasId = canvasId
    })
    return activeCanvasOrThrow(this.history[this.historyIndex]!)
  }

  deleteCanvas(canvasId: string) {
    this.commit((document) => {
      const index = document.canvases.findIndex(canvas => canvas.id === canvasId)
      if (index < 0) {
        throw new Error(`Canvas \`${canvasId}\` was not found.`)
      }
      document.canvases.splice(index, 1)
      if (document.activeCanvasId === canvasId) {
        document.activeCanvasId = document.canvases[0]?.id
      }
    })
  }

  addPath(input: { canvasId?: string, points: WhiteboardPoint[], color?: string, width?: number }) {
    if (input.points.length < 2) {
      throw new Error('A path needs at least two points.')
    }
    const width = input.width ?? 4
    if (!Number.isFinite(width) || width <= 0) {
      throw new TypeError('`width` must be a finite positive number.')
    }
    const path: WhiteboardPath = {
      id: nanoid(),
      color: input.color ?? '#1f2937',
      width,
      points: structuredClone(input.points),
    }
    this.commit((document) => {
      const canvas = activeCanvasOrThrow(document, input.canvasId)
      canvas.paths.push(path)
      canvas.updatedAt = Date.now()
    })
    return path
  }

  removePath(input: { canvasId?: string, pathId: string }) {
    this.commit((document) => {
      const canvas = activeCanvasOrThrow(document, input.canvasId)
      const index = canvas.paths.findIndex(path => path.id === input.pathId)
      if (index < 0) {
        throw new Error(`Path \`${input.pathId}\` was not found.`)
      }
      canvas.paths.splice(index, 1)
      canvas.updatedAt = Date.now()
    })
  }

  addText(input: { canvasId?: string, value: string, x: number, y: number, color?: string, fontSize?: number }) {
    const value = input.value.trim()
    if (!value) {
      throw new Error('Text cannot be empty.')
    }
    const text: WhiteboardText = {
      id: nanoid(),
      value,
      x: input.x,
      y: input.y,
      color: input.color ?? '#111827',
      fontSize: input.fontSize ?? 28,
    }
    this.commit((document) => {
      const canvas = activeCanvasOrThrow(document, input.canvasId)
      canvas.texts.push(text)
      canvas.updatedAt = Date.now()
    })
    return text
  }

  undo() {
    if (this.historyIndex === 0) {
      return false
    }
    this.historyIndex -= 1
    return true
  }

  redo() {
    if (this.historyIndex >= this.history.length - 1) {
      return false
    }
    this.historyIndex += 1
    return true
  }

  private commit(mutate: (document: WhiteboardDocument) => void) {
    const next = this.document
    mutate(next)
    this.history = this.history.slice(0, this.historyIndex + 1)
    this.history.push(next)
    this.historyIndex = this.history.length - 1
    // Each snapshot contains the complete document. Keep recent edits to bound renderer memory.
    if (this.history.length > 100) {
      this.history = this.history.slice(-100)
      this.historyIndex = this.history.length - 1
    }
  }
}
