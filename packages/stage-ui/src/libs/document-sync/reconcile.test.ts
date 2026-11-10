import type { RemoteDocument } from './client'
import type { DocumentFields, ReconcileInput, SyncState } from './reconcile'

import { describe, expect, it } from 'vitest'

import { applyPushResult, reconcile } from './reconcile'

function remoteDocument(id: string, revision: number, fields: Record<string, [revision: number, value: unknown]>): RemoteDocument {
  return {
    id,
    revision,
    deletedAt: null,
    fields: Object.entries(fields).map(([key, [fieldRevision, value]]) => ({ key, revision: fieldRevision, value })),
  }
}

function syncedState(documents: RemoteDocument[]): SyncState {
  return {
    documents: Object.fromEntries(documents.map(document => [document.id, {
      revision: document.revision,
      fields: Object.fromEntries(document.fields.map(field => [field.key, { revision: field.revision, value: field.value }])),
    }])),
  }
}

function plan(input: Partial<ReconcileInput>) {
  return reconcile({
    local: {},
    state: { documents: {} },
    remote: { documents: [] },
    ...input,
  })
}

const luna: DocumentFields = { '/name': 'Luna', '/description': 'Calm' }
const lunaRemote = remoteDocument('luna', 1, { '/name': [1, 'Luna'], '/description': [1, 'Calm'] })

describe('reconcile', () => {
  it('pushes all parts of a card that the server does not have', () => {
    const result = plan({ local: { luna } })

    expect(result.pushes).toEqual([{
      documentId: 'luna',
      fields: [
        { key: '/name', baseRevision: 0, value: 'Luna' },
        { key: '/description', baseRevision: 0, value: 'Calm' },
      ],
    }])
    expect(result.upserts).toEqual({})
  })

  it('takes a card that only the server has', () => {
    const result = plan({ remote: { documents: [lunaRemote] } })

    expect(result.upserts).toEqual({ luna })
    expect(result.pushes).toEqual([])
    expect(result.state).toEqual(syncedState([lunaRemote]))
  })

  it('does nothing when both sides have the same content', () => {
    const result = plan({ local: { luna }, state: syncedState([lunaRemote]), remote: { documents: [lunaRemote] } })

    expect(result).toMatchObject({ upserts: {}, removals: [], conflictCopies: [], pushes: [], deletions: [] })
  })

  it('merges changes that the two sides made to different parts', () => {
    const result = plan({
      local: { luna: { '/name': 'Nova', '/description': 'Calm' } },
      state: syncedState([lunaRemote]),
      remote: { documents: [remoteDocument('luna', 2, { '/name': [1, 'Luna'], '/description': [2, 'Bright'] })] },
    })

    expect(result.upserts).toEqual({ luna: { '/name': 'Nova', '/description': 'Bright' } })
    expect(result.pushes).toEqual([{ documentId: 'luna', fields: [{ key: '/name', baseRevision: 1, value: 'Nova' }] }])
    expect(result.conflictCopies).toEqual([])
  })

  it('takes the remote value and keeps a copy when both sides changed the same part', () => {
    const local = { '/name': 'Nova', '/description': 'Calm' }
    const result = plan({
      local: { luna: local },
      state: syncedState([lunaRemote]),
      remote: { documents: [remoteDocument('luna', 2, { '/name': [2, 'Aria'], '/description': [1, 'Calm'] })] },
    })

    expect(result.upserts).toEqual({ luna: { '/name': 'Aria', '/description': 'Calm' } })
    expect(result.conflictCopies).toEqual([{ documentId: 'luna', fields: local }])
    expect(result.pushes).toEqual([])
  })

  it('does not report a conflict when both sides made the same change', () => {
    const result = plan({
      local: { luna: { '/name': 'Nova', '/description': 'Calm' } },
      state: syncedState([lunaRemote]),
      remote: { documents: [remoteDocument('luna', 2, { '/name': [2, 'Nova'], '/description': [1, 'Calm'] })] },
    })

    expect(result).toMatchObject({ upserts: {}, conflictCopies: [], pushes: [] })
    expect(result.state.documents.luna.fields['/name'].revision).toBe(2)
  })

  it('pushes the removal of a part and takes a remote removal', () => {
    const pushed = plan({
      local: { luna: { '/name': 'Luna' } },
      state: syncedState([lunaRemote]),
      remote: { documents: [lunaRemote] },
    })
    const taken = plan({
      local: { luna },
      state: syncedState([lunaRemote]),
      remote: { documents: [remoteDocument('luna', 2, { '/name': [1, 'Luna'] })] },
    })

    expect(pushed.pushes).toEqual([{ documentId: 'luna', fields: [{ key: '/description', baseRevision: 1, removed: true }] }])
    expect(taken.upserts).toEqual({ luna: { '/name': 'Luna' } })
  })

  it('removes a card that another device deleted', () => {
    const result = plan({
      local: { luna },
      state: syncedState([lunaRemote]),
      remote: { documents: [{ id: 'luna', revision: 2, deletedAt: '2026-10-06T00:00:00.000Z', fields: [] }] },
    })

    expect(result.removals).toEqual(['luna'])
    expect(result.state.documents).toEqual({})
  })

  it('restores a remotely deleted card that has a local edit', () => {
    const result = plan({
      local: { luna: { '/name': 'Nova', '/description': 'Calm' } },
      state: syncedState([lunaRemote]),
      remote: { documents: [{ id: 'luna', revision: 2, deletedAt: '2026-10-06T00:00:00.000Z', fields: [] }] },
    })

    expect(result.removals).toEqual([])
    expect(result.pushes).toEqual([{
      documentId: 'luna',
      fields: [
        { key: '/name', baseRevision: 0, value: 'Nova' },
        { key: '/description', baseRevision: 0, value: 'Calm' },
      ],
    }])
  })

  it('deletes a locally deleted card that has no remote change', () => {
    const result = plan({ state: syncedState([lunaRemote]), remote: { documents: [lunaRemote] } })

    expect(result.deletions).toEqual([{ documentId: 'luna', revision: 1 }])
    expect(result.upserts).toEqual({})
    expect(result.state.documents.luna).toBeDefined()
  })

  it('restores a locally deleted card that another device edited', () => {
    const edited = remoteDocument('luna', 2, { '/name': [2, 'Aria'], '/description': [1, 'Calm'] })
    const result = plan({ state: syncedState([lunaRemote]), remote: { documents: [edited] } })

    expect(result.deletions).toEqual([])
    expect(result.upserts).toEqual({ luna: { '/name': 'Aria', '/description': 'Calm' } })
  })

  // A document that every device creates with the same id sends only its edits.
  // The caller leaves the parts that equal the built-in content out.
  describe('a document with only its edits and no sync history', () => {
    it('takes the remote edit when the local document has no edit', () => {
      const result = plan({
        local: { default: {} },
        remote: { documents: [remoteDocument('default', 3, { '/name': [3, 'Mine'] })] },
      })

      expect(result.upserts).toEqual({ default: { '/name': 'Mine' } })
      expect(result.conflictCopies).toEqual([])
      expect(result.pushes).toEqual([])
    })

    it('pushes the local edits and takes the remote edit of another part', () => {
      const result = plan({
        local: { default: { '/name': 'Mine', '/systemPrompt': 'Be kind' } },
        remote: { documents: [remoteDocument('default', 1, { '/description': [1, 'Theirs'] })] },
      })

      expect(result.upserts).toEqual({ default: { '/name': 'Mine', '/systemPrompt': 'Be kind', '/description': 'Theirs' } })
      expect(result.conflictCopies).toEqual([])
      expect(result.pushes).toEqual([{
        documentId: 'default',
        fields: [
          { key: '/name', baseRevision: 0, value: 'Mine' },
          { key: '/systemPrompt', baseRevision: 0, value: 'Be kind' },
        ],
      }])
    })

    it('merges edits to different parts', () => {
      const result = plan({
        local: { default: { '/systemPrompt': 'Be kind' } },
        remote: { documents: [remoteDocument('default', 2, { '/name': [2, 'Theirs'] })] },
      })

      expect(result.upserts).toEqual({ default: { '/systemPrompt': 'Be kind', '/name': 'Theirs' } })
      expect(result.conflictCopies).toEqual([])
      expect(result.pushes).toEqual([{ documentId: 'default', fields: [{ key: '/systemPrompt', baseRevision: 0, value: 'Be kind' }] }])
    })

    it('keeps a copy when both documents have a different edit of one part', () => {
      const local = { '/name': 'Mine' }
      const result = plan({
        local: { default: local },
        remote: { documents: [remoteDocument('default', 2, { '/name': [2, 'Theirs'] })] },
      })

      expect(result.upserts).toEqual({ default: { '/name': 'Theirs' } })
      expect(result.conflictCopies).toEqual([{ documentId: 'default', fields: local }])
    })

    it('sends nothing for a document without edits that the server does not have', () => {
      const result = plan({ local: { default: {} } })

      expect(result.pushes).toEqual([])
      expect(result.upserts).toEqual({})
    })
  })
})

describe('applyPushResult', () => {
  const state = syncedState([lunaRemote])
  const push = {
    documentId: 'luna',
    fields: [
      { key: '/name', baseRevision: 1, value: 'Nova' },
      { key: '/description', baseRevision: 1, removed: true as const },
    ],
  }

  it('records the accepted parts and the new card revision', () => {
    const next = applyPushResult(state, push, { document: remoteDocument('luna', 2, { '/name': [2, 'Nova'] }), conflicts: [] })

    expect(next.documents.luna).toEqual({ revision: 2, fields: { '/name': { revision: 2, value: 'Nova' } } })
  })

  it('keeps the old state of a part with a conflict', () => {
    const next = applyPushResult(state, push, {
      document: remoteDocument('luna', 3, { '/name': [2, 'Aria'] }),
      conflicts: ['/name'],
    })

    expect(next.documents.luna.fields).toEqual({ '/name': { revision: 1, value: 'Luna' } })
    expect(next.documents.luna.revision).toBe(1)
  })

  it('keeps the old card revision when the card has a part from another device', () => {
    const next = applyPushResult(state, push, {
      document: remoteDocument('luna', 3, { '/name': [3, 'Nova'], '/tags': [2, ['new']] }),
      conflicts: [],
    })

    expect(next.documents.luna.revision).toBe(1)
    expect(next.documents.luna.fields['/name']).toEqual({ revision: 3, value: 'Nova' })
  })

  it('changes nothing when another device deleted the card', () => {
    const next = applyPushResult(state, push, {
      document: { id: 'luna', revision: 2, deletedAt: '2026-10-06T00:00:00.000Z', fields: [] },
      conflicts: ['/name', '/description'],
    })

    expect(next).toBe(state)
  })
})
