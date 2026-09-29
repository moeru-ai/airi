import type { ContactSnapshot } from '@proj-airi/server-sdk-shared/contacts'

import type { ContactClient } from '../libs/contact-sync/client'
import type { AiriCard } from '../types/airiCard'
import type { ContactReplicaRecord, ContactReplicaStorage } from './contact-replica'

import { describe, expect, it, vi } from 'vitest'

import { ContactSyncError } from '../libs/contact-sync/client'
import { applyCharacterDocument, toCharacterDocument } from './character-document'
import { createContactReplica } from './contact-replica'

function card(name = 'Luna'): AiriCard {
  return {
    name,
    version: '1.0.0',
    extensions: {
      airi: {
        modules: {
          consciousness: { provider: '', model: '' },
          vision: { provider: '', model: '' },
          speech: { provider: '', model: '', voice_id: '' },
        },
        agents: {},
      },
    },
  }
}

function memoryStorage() {
  const records = new Map<string, ContactReplicaRecord>()
  const storage: ContactReplicaStorage = {
    load: async ownerId => structuredClone(records.get(ownerId)),
    save: vi.fn(async (record) => { records.set(record.ownerId, structuredClone(record)) }),
  }
  return { storage, records }
}

function remote(ownerId = 'owner') {
  const contacts = new Map<string, ContactSnapshot>()
  const client: ContactClient = {
    list: vi.fn(async () => structuredClone([...contacts.values()])),
    put: vi.fn(async (localId, command) => {
      const previous = contacts.get(localId)
      if (previous?.deletedAt)
        throw new ContactSyncError(409)
      if (previous && previous.lastMutationId === command.mutationId)
        return structuredClone(previous)
      if ((previous?.revision ?? 0) !== command.expectedRevision)
        throw new ContactSyncError(409)
      const timestamp = new Date().toISOString()
      const snapshot: ContactSnapshot = {
        id: `contact-${localId}`,
        ownerId,
        characterId: `character-${localId}`,
        localCharacterId: localId,
        lastMutationId: command.mutationId,
        revision: command.expectedRevision + 1,
        createdAt: previous?.createdAt ?? timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        document: command.document,
      }
      contacts.set(localId, snapshot)
      return structuredClone(snapshot)
    }),
    delete: vi.fn(async (localId) => {
      const previous = contacts.get(localId)
      const timestamp = new Date().toISOString()
      const snapshot: ContactSnapshot = {
        id: `contact-${localId}`,
        ownerId,
        characterId: `character-${localId}`,
        localCharacterId: localId,
        lastMutationId: previous?.lastMutationId ?? null,
        revision: (previous?.revision ?? 0) + 1,
        createdAt: previous?.createdAt ?? timestamp,
        updatedAt: timestamp,
        deletedAt: timestamp,
        document: null,
      }
      contacts.set(localId, snapshot)
      const { document, ...contact } = snapshot
      return { contact, chatIds: [`history-${localId}`] }
    }),
  }
  return { client, contacts }
}

describe('portable character documents', () => {
  it('retains inheritance but excludes local options, paths, and unknown extensions', () => {
    const local = card()
    local.extensions.other = { secret: 'private-key' }
    local.extensions.airi.modules.vrm = { file: '/device/avatar.vrm', source: 'file' }
    local.extensions.airi.modules.artistry = { provider: 'image', options: { apiKey: 'private-key' }, workflowId: 'device-workflow' }
    const document = toCharacterDocument(local)
    expect(document.extensions.airi.modules.consciousness).toEqual({ provider: '', model: '' })
    expect(JSON.stringify(document)).not.toContain('private-key')
    expect(document.extensions.airi.modules).not.toHaveProperty('vrm')
    expect(document.extensions.airi.modules.artistry).toEqual({ provider: 'image' })
    const restored = applyCharacterDocument(document, local)
    expect(restored.extensions.other).toEqual(local.extensions.other)
    expect(restored.extensions.airi.modules.vrm).toEqual(local.extensions.airi.modules.vrm)
    expect(restored.extensions.airi.modules.artistry?.options).toEqual({ apiKey: 'private-key' })
  })

  it('clears removed portable fields without discarding device-only metadata', () => {
    const local = card()
    local.description = 'old'
    local.extensions.airi.modules.displayModelId = 'old-model'
    local.metadata = { custom: 'keep' }
    const restored = applyCharacterDocument(toCharacterDocument(card('Remote')), local)
    expect(restored.name).toBe('Remote')
    expect(restored.description).toBeUndefined()
    expect(restored.extensions.airi.modules.displayModelId).toBeUndefined()
    expect(restored.metadata).toEqual({ custom: 'keep' })
    expect(local.description).toBe('old')
  })
})

describe('durable contact replicas', () => {
  it('restores characters on a clean second device without adopting the first device defaults', async () => {
    const server = remote()
    const first = await createContactReplica('owner', { luna: card() }, memoryStorage().storage)
    await first.sync(server.client)
    const second = await createContactReplica('owner', {}, memoryStorage().storage)
    await second.sync(server.client)
    expect(second.snapshot().cards.luna).toEqual(card())
    expect(second.snapshot().contacts.luna.id).toBe(first.snapshot().contacts.luna.id)
    expect(server.client.put).toHaveBeenCalledTimes(1)
  })

  it('persists edits before upload and restores the same mutation after a lost response', async () => {
    const { storage } = memoryStorage()
    const server = remote()
    const first = await createContactReplica('owner', {}, storage)
    await first.put('luna', card())
    const mutation = first.snapshot().writes.luna[0]
    const originalPut = server.client.put
    const interrupted: ContactClient = { ...server.client, put: async (id, command) => {
      await originalPut(id, command)
      throw new Error('Response lost after commit')
    } }
    await expect(first.sync(interrupted)).rejects.toThrow('Response lost after commit')
    const restored = await createContactReplica('owner', {}, storage)
    expect(restored.snapshot().writes.luna[0]).toEqual(mutation)
    await restored.sync(server.client)
    expect(restored.snapshot().writes).toEqual({})
    expect(restored.snapshot().contacts.luna.revision).toBe(1)
    expect(server.client.put).toHaveBeenCalledTimes(1)
  })

  it('keeps both versions on conflict until the user chooses', async () => {
    const server = remote()
    const first = await createContactReplica('owner', { luna: card() }, memoryStorage().storage)
    await first.sync(server.client)
    const second = await createContactReplica('owner', {}, memoryStorage().storage)
    await second.sync(server.client)
    await first.put('luna', card('First edit'))
    await first.sync(server.client)
    await second.put('luna', card('Second edit'))
    await second.sync(server.client)
    expect(second.snapshot().conflicts).toEqual(['luna'])
    expect(second.snapshot().cards.luna.name).toBe('Second edit')
    expect(second.snapshot().contacts.luna.document?.name).toBe('First edit')
    await second.resolveConflict('luna', 'local')
    await second.sync(server.client)
    expect(server.contacts.get('luna')?.document?.name).toBe('Second edit')
    expect(second.snapshot().conflicts).toEqual([])
  })

  it('deletes offline, retries after reload, and discards stale writes on another device', async () => {
    const server = remote()
    const { storage } = memoryStorage()
    const first = await createContactReplica('owner', { luna: card() }, storage)
    await first.sync(server.client)
    const second = await createContactReplica('owner', {}, memoryStorage().storage)
    await second.sync(server.client)
    await second.put('luna', card('Offline stale edit'))
    await first.delete('luna')
    expect(first.snapshot().cards).toEqual({})
    expect(first.snapshot().deletions).toEqual(['luna'])
    const restored = await createContactReplica('owner', {}, storage)
    await restored.sync(server.client)
    expect(restored.snapshot().deletions).toEqual([])
    expect(restored.snapshot().deletedChatIds).toEqual(['history-luna'])
    await second.sync(server.client)
    expect(second.snapshot().cards).toEqual({})
    expect(second.snapshot().writes).toEqual({})
    expect(second.snapshot().deletedCharacterIds).toEqual(['luna'])
    expect(server.client.put).toHaveBeenCalledTimes(1)
    await expect(second.put('luna', card('Resurrection'))).rejects.toThrow('Deleted character identities')
  })

  it('persists a delete command even when the character has never received a remote id', async () => {
    const server = remote()
    const replica = await createContactReplica('owner', {}, memoryStorage().storage)
    await replica.put('new-character', card())
    await replica.delete('new-character')
    await replica.sync(server.client)
    expect(server.client.put).not.toHaveBeenCalled()
    expect(server.client.delete).toHaveBeenCalledWith('new-character')
    expect(replica.snapshot().deletedContactIds).toEqual(['contact-new-character'])
  })

  it('never treats absence from a list as deletion and never accepts another account snapshot', async () => {
    const server = remote()
    const replica = await createContactReplica('owner', { luna: card() }, memoryStorage().storage)
    await replica.sync(server.client)
    const saved = replica.snapshot()
    await replica.sync({ ...server.client, list: async () => [] })
    expect(replica.snapshot().cards).toEqual(saved.cards)
    const foreign = { ...saved.contacts.luna, ownerId: 'another-owner' }
    await expect(replica.sync({ ...server.client, list: async () => [foreign] })).rejects.toThrow('another account')
    expect(replica.snapshot()).toEqual(saved)
  })

  it('keeps local-only changes off the network and does not publish failed persistence', async () => {
    const { storage } = memoryStorage()
    const server = remote()
    const replica = await createContactReplica('local', {}, storage)
    await replica.put('luna', card())
    await replica.sync(server.client)
    expect(server.client.list).not.toHaveBeenCalled()
    expect(replica.snapshot().writes).toEqual({})
    vi.mocked(storage.save).mockRejectedValueOnce(new Error('Storage quota'))
    await expect(replica.delete('luna')).rejects.toThrow('Storage quota')
    expect(replica.snapshot().cards.luna.name).toBe('Luna')
    expect(replica.snapshot().deletedCharacterIds).toEqual([])
  })

  it('rejects late network completion after the account replica closes', async () => {
    const { storage } = memoryStorage()
    const replica = await createContactReplica('owner', {}, storage)
    const server = remote()
    const gate = Promise.withResolvers<ContactSnapshot[]>()
    const listing = vi.fn(() => gate.promise)
    const pending = replica.sync({ ...server.client, list: listing })
    await vi.waitFor(() => expect(listing).toHaveBeenCalledOnce())
    replica.dispose()
    gate.resolve([])
    await expect(pending).rejects.toThrow('closed')
    expect(storage.save).toHaveBeenCalledTimes(1)
    expect(server.client.put).not.toHaveBeenCalled()
    await expect(replica.put('late', card())).rejects.toThrow('closed')
  })

  it('drains several offline edits in revision order', async () => {
    const replica = await createContactReplica('owner', {}, memoryStorage().storage)
    const server = remote()
    await replica.put('luna', card('First'))
    await replica.put('luna', card('Second'))
    expect(replica.snapshot().writes.luna.map(command => command.expectedRevision)).toEqual([0, 1])
    await replica.sync(server.client)
    expect(replica.snapshot().cards.luna.name).toBe('Second')
    expect(replica.snapshot().contacts.luna.revision).toBe(2)
    expect(replica.snapshot().writes).toEqual({})
  })
})
