import type { WhiteboardCanvas, WhiteboardDocument, WhiteboardPath, WhiteboardPoint, WhiteboardText } from './model'

import { createWhiteboardDocument } from './model'

/** Stable local-storage key for this extension and schema version. */
export const whiteboardStorageKey = 'airi.extension.whiteboard.v1'

const legacyStorageKeys = ['stage-ui-whiteboard', 'airi.whiteboard']

/** Small storage boundary used by the whiteboard UI and unit tests. */
export interface WhiteboardStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function asFiniteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asString(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback
}

function normalizePoint(value: unknown): WhiteboardPoint | undefined {
  if (!isRecord(value) || typeof value.x !== 'number' || typeof value.y !== 'number') {
    return undefined
  }
  return { x: value.x, y: value.y }
}

function normalizePath(value: unknown): WhiteboardPath | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !Array.isArray(value.points)) {
    return undefined
  }
  const points = value.points.map(normalizePoint).filter((point): point is WhiteboardPoint => Boolean(point))
  if (points.length < 2) {
    return undefined
  }
  return {
    id: value.id,
    points,
    color: asString(value.color, '#1f2937'),
    width: asFiniteNumber(value.width, 4),
  }
}

function normalizeText(value: unknown): WhiteboardText | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.value !== 'string') {
    return undefined
  }
  return {
    id: value.id,
    value: value.value,
    x: asFiniteNumber(value.x, 0),
    y: asFiniteNumber(value.y, 0),
    color: asString(value.color, '#111827'),
    fontSize: asFiniteNumber(value.fontSize, 28),
  }
}

function normalizeCanvas(value: unknown): WhiteboardCanvas | undefined {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return undefined
  }
  return {
    id: value.id,
    name: asString(value.name, 'Untitled canvas'),
    width: asFiniteNumber(value.width, 1200),
    height: asFiniteNumber(value.height, 800),
    background: asString(value.background, '#ffffff'),
    paths: Array.isArray(value.paths)
      ? value.paths.map(normalizePath).filter((path): path is WhiteboardPath => Boolean(path))
      : [],
    texts: Array.isArray(value.texts)
      ? value.texts.map(normalizeText).filter((text): text is WhiteboardText => Boolean(text))
      : [],
    createdAt: asFiniteNumber(value.createdAt, 0),
    updatedAt: asFiniteNumber(value.updatedAt, 0),
  }
}

/**
 * Normalizes untrusted persisted data to the current whiteboard document.
 *
 * @example
 * normalizeWhiteboardDocument({ canvases: [] })
 * // => { schemaVersion: 1, canvases: [] }
 */
export function normalizeWhiteboardDocument(value: unknown): WhiteboardDocument {
  if (!isRecord(value) || !Array.isArray(value.canvases)) {
    return createWhiteboardDocument()
  }
  const canvases = value.canvases
    .map(normalizeCanvas)
    .filter((canvas): canvas is WhiteboardCanvas => Boolean(canvas))
  const activeCanvasId = typeof value.activeCanvasId === 'string' && canvases.some(canvas => canvas.id === value.activeCanvasId)
    ? value.activeCanvasId
    : canvases[0]?.id
  return activeCanvasId
    ? { schemaVersion: 1, activeCanvasId, canvases }
    : { schemaVersion: 1, canvases }
}

function parseDocument(serialized: string | null) {
  if (!serialized) {
    return undefined
  }
  try {
    return normalizeWhiteboardDocument(JSON.parse(serialized))
  }
  catch {
    return undefined
  }
}

/**
 * Loads a local document and migrates one old experimental key when present.
 *
 * The migration removes the old key only after the current schema was stored.
 */
export function loadWhiteboardDocument(storage: WhiteboardStorage): WhiteboardDocument {
  const current = parseDocument(storage.getItem(whiteboardStorageKey))
  if (current) {
    return current
  }
  for (const legacyKey of legacyStorageKeys) {
    const legacy = parseDocument(storage.getItem(legacyKey))
    if (!legacy) {
      continue
    }
    saveWhiteboardDocument(storage, legacy)
    storage.removeItem(legacyKey)
    return legacy
  }
  return createWhiteboardDocument()
}

/** Saves the current document in the extension-scoped local storage key. */
export function saveWhiteboardDocument(storage: WhiteboardStorage, document: WhiteboardDocument) {
  storage.setItem(whiteboardStorageKey, JSON.stringify(document))
}
