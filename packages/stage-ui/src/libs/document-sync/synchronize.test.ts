import type { DocumentSyncClient, PushResult, RemoteSnapshot } from './client'
import type { SyncState } from './reconcile'
import type { AppliedLocalChanges, LocalDocumentChanges } from './synchronize'

import { describe, expect, it, vi } from 'vitest'

import { DocumentSyncRequestError } from './client'
import { synchronize } from './synchronize'

const emptyState: SyncState = { documents: {} }
const appliedNothing: AppliedLocalChanges = { rejected: [] }

function createClient(remote: RemoteSnapshot, extraRemoteField?: { key: string, value: unknown }) {
  const push = vi.fn<DocumentSyncClient['push']>(async (documentId, fields): Promise<PushResult> => ({
    document: {
      id: documentId,
      revision: extraRemoteField ? 2 : 1,
      deletedAt: null,
      fields: [
        ...fields.flatMap(field => 'removed' in field ? [] : [{ key: field.key, revision: 1, value: field.value }]),
        ...(extraRemoteField ? [{ ...extraRemoteField, revision: 2 }] : []),
      ],
    },
    conflicts: [],
  }))
  const list = vi.fn(async () => remote)
  const remove = vi.fn(async () => true)
  const history = vi.fn(async () => null)
  const snapshot = vi.fn(async () => null)
  const client: DocumentSyncClient = { list, push, remove, history, snapshot }
  return { client, list, push, remove }
}

const lunaRemote: RemoteSnapshot = {
  documents: [{ id: 'luna', revision: 1, deletedAt: null, fields: [{ key: '/name', revision: 1, value: 'Luna' }] }],
}

describe('synchronize', () => {
  it('sends the local documents and stores the accepted revisions', async () => {
    const { client, push } = createClient({ documents: [] })
    const saved: SyncState[] = []

    await synchronize({
      client,
      state: emptyState,
      isCurrent: () => true,
      saveState: async (state) => { saved.push(state) },
      readLocal: () => ({ luna: { '/name': 'Luna' } }),
      applyLocal: async () => appliedNothing,
    })

    expect(push).toHaveBeenCalledWith('luna', [{ key: '/name', baseRevision: 0, value: 'Luna' }])
    expect(saved.at(-1)?.documents.luna.fields['/name']).toEqual({ revision: 1, value: 'Luna' })
  })

  it('writes the remote documents locally in the same task as the read', async () => {
    const { client } = createClient(lunaRemote)
    let applied: LocalDocumentChanges | undefined
    let resumedBetween = false

    await synchronize({
      client,
      state: emptyState,
      isCurrent: () => true,
      saveState: async () => {},
      readLocal: () => {
        // A microtask runs at the first await after this call. It sees an unset `applied` if the run awaits before `applyLocal`.
        queueMicrotask(() => {
          resumedBetween = !applied
        })
        return {}
      },
      applyLocal: async (changes) => {
        applied = changes
        return appliedNothing
      },
    })

    expect(applied?.upserts).toEqual({ luna: { '/name': 'Luna' } })
    expect(resumedBetween).toBe(false)
  })

  // A card that this device cannot read stays out of the local cards. Without
  // the rejected list, the state records it as merged. The next run then reads
  // the missing local card as a deletion and deletes the server copy.
  it('keeps the server copy of a document that the caller rejected', async () => {
    const { client, remove } = createClient(lunaRemote)
    let state = emptyState
    const run = () => synchronize({
      client,
      state,
      isCurrent: () => true,
      saveState: async (saved) => { state = saved },
      readLocal: () => ({}),
      applyLocal: async () => ({ rejected: ['luna'] }),
    })

    await run()
    await run()

    expect(state.documents.luna).toBeUndefined()
    expect(remove).not.toHaveBeenCalled()
  })

  it('keeps the earlier state of a rejected document that this device already merged', async () => {
    const { client, remove } = createClient({ documents: [{ id: 'luna', revision: 3, deletedAt: null, fields: [{ key: '/name', revision: 3, value: 'Broken' }] }] })
    const merged: SyncState = { documents: { luna: { revision: 1, fields: { '/name': { revision: 1, value: 'Luna' } } } } }
    let state = merged

    await synchronize({
      client,
      state,
      isCurrent: () => true,
      saveState: async (saved) => { state = saved },
      readLocal: () => ({ luna: { '/name': 'Luna' } }),
      applyLocal: async () => ({ rejected: ['luna'] }),
    })

    expect(state).toEqual(merged)
    expect(remove).not.toHaveBeenCalled()
  })

  // A rejected document keeps its earlier state, so another round finds the
  // same conflict and the caller rejects it again. Only a copy that the caller
  // kept is a new local document for the next round to send.
  it('runs no extra round for the conflict of a rejected document', async () => {
    const { client, list } = createClient({ documents: [{ id: 'luna', revision: 2, deletedAt: null, fields: [{ key: '/name', revision: 2, value: 'Broken' }] }] })
    let applied: LocalDocumentChanges | undefined

    await synchronize({
      client,
      state: { documents: { luna: { revision: 1, fields: { '/name': { revision: 1, value: 'Luna' } } } } },
      isCurrent: () => true,
      saveState: async () => {},
      readLocal: () => ({ luna: { '/name': 'Mine' } }),
      applyLocal: async (changes) => {
        applied = changes
        return { rejected: ['luna'] }
      },
    })

    expect(applied?.conflictCopies.map(copy => copy.documentId)).toEqual(['luna'])
    expect(list).toHaveBeenCalledTimes(1)
  })

  // The server returns a field that another device wrote after this run read the list.
  // The state keeps the older document revision, so the run reads the server again.
  it('runs another round when a push result has a field that this run did not merge', async () => {
    const { client, list } = createClient({ documents: [] }, { key: '/tags', value: ['new'] })

    await synchronize({
      client,
      state: emptyState,
      isCurrent: () => true,
      saveState: async () => {},
      readLocal: () => ({ luna: { '/name': 'Luna' } }),
      applyLocal: async () => appliedNothing,
    })

    expect(list.mock.calls.length).toBeGreaterThan(1)
  })

  // The server refuses one document, for example when the account is over its limit.
  // The documents after it must still reach the server.
  it('goes on with the other documents when the server refuses one', async () => {
    const { client, push } = createClient({ documents: [] })
    const accepted = push.getMockImplementation()!
    push.mockImplementation(async (documentId, fields) => {
      if (documentId === 'big')
        throw new DocumentSyncRequestError(413, 'Payload Too Large')
      return accepted(documentId, fields)
    })
    let state = emptyState

    const result = await synchronize({
      client,
      state,
      isCurrent: () => true,
      saveState: async (saved) => { state = saved },
      readLocal: () => ({ big: { '/name': 'Big' }, luna: { '/name': 'Luna' } }),
      applyLocal: async () => appliedNothing,
    })

    expect(result.refused).toEqual(['big'])
    expect(push).toHaveBeenCalledTimes(2)
    expect(result.state.documents.luna).toBeDefined()
    expect(result.state.documents.big).toBeUndefined()
    expect(state).toEqual(result.state)
  })

  it.each([
    ['a network failure', new Error('network')],
    ['a server failure', new DocumentSyncRequestError(500, 'Internal Server Error')],
    ['an expired login', new DocumentSyncRequestError(401, 'Unauthorized')],
  ])('stops the run on %s and keeps the sync state for the next run', async (_, error) => {
    const { client, push } = createClient({ documents: [] })
    push.mockRejectedValue(error)

    await expect(synchronize({
      client,
      state: emptyState,
      isCurrent: () => true,
      saveState: async () => {},
      readLocal: () => ({ luna: { '/name': 'Luna' } }),
      applyLocal: async () => appliedNothing,
    })).rejects.toBe(error)
  })

  // Sign-out or an account change while the run waits for storage. The request
  // reads the token when it starts, so a push after the change would write the
  // documents of the old account into the new account.
  it('does not send a request after the account changed', async () => {
    const { client, push } = createClient({ documents: [] })
    let current = true

    await synchronize({
      client,
      state: emptyState,
      isCurrent: () => current,
      saveState: async () => { current = false },
      readLocal: () => ({ luna: { '/name': 'Luna' } }),
      applyLocal: async () => appliedNothing,
    })

    expect(push).not.toHaveBeenCalled()
  })

  it('does not read the server when the account changed before the run', async () => {
    const { client, list } = createClient({ documents: [] })

    await synchronize({
      client,
      state: emptyState,
      isCurrent: () => false,
      saveState: async () => {},
      readLocal: () => ({}),
      applyLocal: async () => appliedNothing,
    })

    expect(list).not.toHaveBeenCalled()
  })
})
