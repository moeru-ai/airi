import type { DocumentSyncClient, PushResult, RemoteSnapshot } from './client'
import type { SyncState } from './reconcile'
import type { LocalDocumentChanges } from './synchronize'

import { describe, expect, it, vi } from 'vitest'

import { synchronize } from './synchronize'

const emptyState: SyncState = { documents: {} }

function createClient(remote: RemoteSnapshot) {
  const push = vi.fn<DocumentSyncClient['push']>(async (documentId, fields): Promise<PushResult> => ({
    document: {
      id: documentId,
      revision: 1,
      deletedAt: null,
      fields: fields.flatMap(field => 'removed' in field ? [] : [{ key: field.key, revision: 1, value: field.value }]),
    },
    conflicts: [],
  }))
  const client: DocumentSyncClient = {
    list: vi.fn(async () => remote),
    push,
    remove: vi.fn(async () => true),
  }
  return { client, push }
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
      readLocal: () => ({ documents: { luna: { '/name': 'Luna' } }, pristine: {} }),
      applyLocal: async () => {},
    })

    expect(push).toHaveBeenCalledWith('luna', [{ key: '/name', baseRevision: 0, value: 'Luna' }])
    expect(saved.at(-1)?.documents.luna.fields['/name']).toEqual({ revision: 1, value: 'Luna' })
  })

  it('writes the remote documents locally in the same task as the read', async () => {
    const { client } = createClient({ documents: [{ id: 'luna', revision: 1, deletedAt: null, fields: [{ key: '/name', revision: 1, value: 'Luna' }] }] })
    let applied: LocalDocumentChanges | undefined
    let resumedBetween = false

    const run = synchronize({
      client,
      state: emptyState,
      isCurrent: () => true,
      saveState: async () => {},
      readLocal: () => {
        // A microtask runs at the first await after this call. It sees an unset `applied` if the run awaits before `applyLocal`.
        queueMicrotask(() => {
          resumedBetween = !applied
        })
        return { documents: {}, pristine: {} }
      },
      applyLocal: async (changes) => { applied = changes },
    })
    await run

    expect(applied?.upserts).toEqual({ luna: { '/name': 'Luna' } })
    expect(resumedBetween).toBe(false)
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
      readLocal: () => ({ documents: { luna: { '/name': 'Luna' } }, pristine: {} }),
      applyLocal: async () => {},
    })

    expect(push).not.toHaveBeenCalled()
  })

  it('does not read the server when the account changed before the run', async () => {
    const { client } = createClient({ documents: [] })

    await synchronize({
      client,
      state: emptyState,
      isCurrent: () => false,
      saveState: async () => {},
      readLocal: () => ({ documents: {}, pristine: {} }),
      applyLocal: async () => {},
    })

    expect(client.list).not.toHaveBeenCalled()
  })
})
