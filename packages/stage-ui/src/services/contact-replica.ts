import type { ContactSnapshot, PutCharacterDocument } from '@proj-airi/server-sdk-shared/contacts'

import type { ContactClient } from '../libs/contact-sync/client'
import type { AiriCard } from '../types/airiCard'

import { isEqual } from 'es-toolkit'
import { nanoid } from 'nanoid'

import { ContactSyncError } from '../libs/contact-sync/client'
import { applyCharacterDocument, toCharacterDocument } from './character-document'

/** One account's durable catalog, commands, conflicts, and retained deletion identities. */
export interface ContactReplicaRecord {
  ownerId: string
  cards: Record<string, AiriCard>
  contacts: Record<string, ContactSnapshot>
  writes: Record<string, PutCharacterDocument[]>
  deletions: string[]
  deletedCharacterIds: string[]
  deletedContactIds: string[]
  deletedChatIds: string[]
  conflicts: string[]
}

/** Storage is account-scoped. Saves must commit the whole record atomically before resolving. */
export interface ContactReplicaStorage {
  load: (ownerId: string) => Promise<ContactReplicaRecord | undefined | null>
  save: (record: ContactReplicaRecord) => Promise<void>
}

/**
 * Serializes local changes and cloud reconciliation for one account.
 * Commands persist before network IO. Lost responses retain the original mutation identity.
 * Deletion wins over pending edits; revision conflicts retain both versions until an explicit choice.
 */
export async function createContactReplica(ownerId: string, initialCards: Record<string, AiriCard>, storage: ContactReplicaStorage) {
  const loaded = await storage.load(ownerId)
  if (loaded && loaded.ownerId !== ownerId)
    throw new Error('Character catalog belongs to another account')
  let state: ContactReplicaRecord = loaded ?? {
    ownerId,
    cards: structuredClone(initialCards),
    contacts: {},
    writes: {},
    deletions: [],
    deletedCharacterIds: [],
    deletedContactIds: [],
    deletedChatIds: [],
    conflicts: [],
  }
  let disposed = false
  let queue = Promise.resolve()
  if (!loaded)
    await storage.save(structuredClone(state))

  function enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
    const next = queue.then(() => {
      if (disposed)
        throw new Error('Character catalog is closed')
      return operation()
    })
    queue = next.then(() => undefined, () => undefined)
    return next
  }

  async function commit(next: ContactReplicaRecord) {
    if (disposed)
      throw new Error('Character catalog is closed')
    await storage.save(structuredClone(next))
    state = next
  }

  function queueWrite(next: ContactReplicaRecord, localId: string, card: AiriCard) {
    const document = toCharacterDocument(card)
    const pending = next.writes[localId] ?? []
    const previous = pending.at(-1)
    if (previous && isEqual(previous.document, document))
      return
    if (!previous && isEqual(next.contacts[localId]?.document, document))
      return
    const expectedRevision = previous ? previous.expectedRevision + 1 : (next.contacts[localId]?.revision ?? 0)
    next.writes[localId] = [...pending, { document, expectedRevision, mutationId: nanoid() }]
  }

  function applyRemote(next: ContactReplicaRecord, remote: ContactSnapshot) {
    if (remote.ownerId !== ownerId)
      throw new Error('Contact response belongs to another account')
    if (remote.deletedAt && !next.deletedContactIds.includes(remote.id))
      next.deletedContactIds.push(remote.id)
    const localId = remote.localCharacterId
    if (localId === null)
      return
    const previous = next.contacts[localId]
    if (previous && (previous.id !== remote.id || previous.revision > remote.revision))
      throw new Error('Contact identity or revision moved backwards')
    next.contacts[localId] = remote
    if (remote.deletedAt) {
      delete next.cards[localId]
      delete next.writes[localId]
      next.deletions = next.deletions.filter(id => id !== localId)
      next.conflicts = next.conflicts.filter(id => id !== localId)
      if (!next.deletedCharacterIds.includes(localId))
        next.deletedCharacterIds.push(localId)
      return
    }
    if (next.deletedCharacterIds.includes(localId))
      return
    if (!remote.document)
      throw new Error('An active private contact has no character definition')
    const pending = next.writes[localId]
    if (pending?.length) {
      const first = pending[0]
      if (first.mutationId === remote.lastMutationId && isEqual(first.document, remote.document)) {
        pending.shift()
        next.conflicts = next.conflicts.filter(id => id !== localId)
        if (!pending.length)
          delete next.writes[localId]
      }
      else if (first.expectedRevision !== remote.revision && !next.conflicts.includes(localId)) {
        next.conflicts.push(localId)
      }
    }
    if (!next.writes[localId]?.length)
      next.cards[localId] = applyCharacterDocument(remote.document, next.cards[localId])
  }

  return {
    snapshot: () => structuredClone(state),
    dispose: () => { disposed = true },

    put(localId: string, card: AiriCard) {
      return enqueue(async () => {
        if (state.deletedCharacterIds.includes(localId))
          throw new Error('Deleted character identities cannot be reused')
        const next = structuredClone(state)
        next.cards[localId] = structuredClone(card)
        if (ownerId !== 'local')
          queueWrite(next, localId, card)
        await commit(next)
      })
    },

    delete(localId: string) {
      return enqueue(async () => {
        if (localId === 'default')
          throw new Error('The built-in character cannot be deleted')
        const next = structuredClone(state)
        delete next.cards[localId]
        delete next.writes[localId]
        next.conflicts = next.conflicts.filter(id => id !== localId)
        if (!next.deletedCharacterIds.includes(localId))
          next.deletedCharacterIds.push(localId)
        if (ownerId !== 'local' && !next.deletions.includes(localId) && !next.contacts[localId]?.deletedAt)
          next.deletions.push(localId)
        await commit(next)
      })
    },

    resolveConflict(localId: string, choice: 'local' | 'remote') {
      return enqueue(async () => {
        const next = structuredClone(state)
        const remote = next.contacts[localId]
        if (!next.conflicts.includes(localId) || !remote?.document || remote.deletedAt)
          throw new Error('No active character conflict to resolve')
        delete next.writes[localId]
        next.conflicts = next.conflicts.filter(id => id !== localId)
        if (choice === 'remote')
          next.cards[localId] = applyCharacterDocument(remote.document, next.cards[localId])
        else
          queueWrite(next, localId, next.cards[localId])
        await commit(next)
      })
    },

    sync(client: ContactClient) {
      return enqueue(async () => {
        if (ownerId === 'local')
          return
        const remoteContacts = await client.list()
        const next = structuredClone(state)
        for (const remote of remoteContacts)
          applyRemote(next, remote)
        for (const [localId, card] of Object.entries(next.cards)) {
          if (!next.contacts[localId] && !next.writes[localId]?.length)
            queueWrite(next, localId, card)
        }
        await commit(next)

        for (const localId of [...state.deletions]) {
          const result = await client.delete(localId)
          if (result.contact.localCharacterId !== localId || !result.contact.deletedAt)
            throw new Error('Contact deletion response does not match its command')
          const deleted = structuredClone(state)
          applyRemote(deleted, { ...result.contact, document: null })
          deleted.deletedChatIds = [...new Set([...deleted.deletedChatIds, ...result.chatIds])]
          await commit(deleted)
        }

        for (const localId of Object.keys(state.writes)) {
          if (state.conflicts.includes(localId))
            continue
          while (state.writes[localId]?.length) {
            const command = state.writes[localId][0]
            try {
              const remote = await client.put(localId, command)
              if (remote.localCharacterId !== localId || remote.lastMutationId !== command.mutationId
                || remote.revision !== command.expectedRevision + 1 || !isEqual(remote.document, command.document)) {
                throw new Error('Character response does not match its command')
              }
              const accepted = structuredClone(state)
              applyRemote(accepted, remote)
              await commit(accepted)
            }
            catch (error) {
              if (!(error instanceof ContactSyncError) || error.status !== 409)
                throw error
              const conflicted = structuredClone(state)
              if (!conflicted.conflicts.includes(localId))
                conflicted.conflicts.push(localId)
              await commit(conflicted)
              break
            }
          }
        }
      })
    },
  }
}

export type ContactReplica = Awaited<ReturnType<typeof createContactReplica>>
