import { describe, expect, it } from 'vitest'

import { createWhiteboardDocument } from './model'
import { loadWhiteboardDocument, saveWhiteboardDocument, whiteboardStorageKey } from './storage'

function createStorage(initial: Record<string, string> = {}) {
  const entries = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  }
}

describe('whiteboard storage', () => {
  it('saves and restores the extension-scoped document key', () => {
    const storage = createStorage()
    const document = createWhiteboardDocument()

    saveWhiteboardDocument(storage, document)

    expect(loadWhiteboardDocument(storage)).toEqual(document)
  })

  it('migrates a valid experimental document exactly once', () => {
    const legacyDocument = {
      canvases: [{
        id: 'legacy-canvas',
        name: 'Legacy',
        width: 200,
        height: 100,
        background: '#fff',
        paths: [],
        texts: [],
        createdAt: 1,
        updatedAt: 1,
      }],
      activeCanvasId: 'legacy-canvas',
    }
    const storage = createStorage({ 'stage-ui-whiteboard': JSON.stringify(legacyDocument) })

    const migrated = loadWhiteboardDocument(storage)

    expect(migrated.activeCanvasId).toBe('legacy-canvas')
    expect(storage.getItem('stage-ui-whiteboard')).toBeNull()
    expect(JSON.parse(storage.getItem(whiteboardStorageKey)!)).toEqual(migrated)
  })
})
