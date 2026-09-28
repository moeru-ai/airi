import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { contactReplicaRepo } from '../../database/repos/contact-replica.repo'
import { storage } from '../../database/storage'
import { useAuthStore } from '../auth'
import { useAiriCardCatalog } from './airi-card-catalog'

const defaults = {
  consciousness: { provider: '', model: '' },
  vision: { provider: '', model: '' },
  speech: { provider: '', model: '', voice_id: '' },
}
const builtin = { name: 'ReLU', version: '1.0.0', extensions: { airi: { modules: defaults, agents: {} } } }
const instances: ReturnType<typeof createPinia>[] = []

function context() {
  const pinia = createPinia()
  createApp({}).use(pinia).use(PiniaColada)
  instances.push(pinia)
  const auth = useAuthStore(pinia)
  const catalog = useAiriCardCatalog(pinia)
  function account(id: string) {
    auth.user = { id, name: id, email: `${id}@example.test`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() }
  }
  return { auth, catalog, account }
}

beforeEach(async () => {
  localStorage.clear()
  await storage.clear('local')
})

afterEach(() => {
  for (const pinia of instances.splice(0))
    disposePinia(pinia)
  vi.restoreAllMocks()
})

describe('account-scoped character catalogs', () => {
  it('clears a previous account synchronization error when another account activates', async () => {
    const { catalog, account } = context()
    account('alice')
    await catalog.initialize(builtin, defaults)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Alice connection failed')))
    try {
      await expect(catalog.syncContacts()).rejects.toThrow('Alice connection failed')
      expect(catalog.syncError).toBe('Alice connection failed')
      account('bob')
      await catalog.activateAccount()
      expect(catalog.currentRecord?.ownerId).toBe('bob')
      expect(catalog.syncError).toBeNull()
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('claims the anonymous catalog once and hides previous account cards during switching', async () => {
    const { catalog, account } = context()
    await catalog.initialize(builtin, defaults)
    const localId = await catalog.addCard({ ...builtin, name: 'Offline Luna' })
    account('alice')
    expect(catalog.cards.size).toBe(0)
    await catalog.activateAccount()
    expect(catalog.cards.get(localId)?.name).toBe('Offline Luna')
    await catalog.updateCard(localId, { ...builtin, name: 'Alice Luna' })
    account('bob')
    expect(catalog.cards.size).toBe(0)
    await catalog.activateAccount()
    expect([...catalog.cards.keys()]).toEqual(['default'])
    account('alice')
    await catalog.activateAccount()
    expect(catalog.cards.get(localId)?.name).toBe('Alice Luna')
    expect((await contactReplicaRepo.load('alice'))?.cards[localId].name).toBe('Alice Luna')
    expect((await contactReplicaRepo.load('bob'))?.cards[localId]).toBeUndefined()
  })

  it('keeps failed storage writes invisible and does not persist replicated snapshots', async () => {
    const { catalog } = context()
    await catalog.initialize(builtin, defaults)
    const write = vi.spyOn(contactReplicaRepo, 'save').mockRejectedValueOnce(new Error('disk full'))
    await expect(catalog.addCard({ ...builtin, name: 'Unsaved' })).rejects.toThrow('disk full')
    expect([...catalog.cards.values()].map(card => card.name)).toEqual(['ReLU'])
    write.mockClear()
    catalog.$patch({ record: JSON.parse(JSON.stringify(catalog.record)) })
    expect(write).not.toHaveBeenCalled()
  })

  it('does not reimport a legacy character deleted before sign-in', async () => {
    localStorage.setItem('airi-cards', JSON.stringify([['default', builtin], ['old-role', { ...builtin, name: 'Deleted' }]]))
    const { catalog, account } = context()
    await catalog.initialize(builtin, defaults)
    await catalog.removeCard('old-role')
    account('first-owner')
    await catalog.activateAccount()
    expect(catalog.cards.has('old-role')).toBe(false)
  })

  it('restores pending account edits after reload without resolving inherited model settings', async () => {
    const first = context()
    first.account('alice')
    await first.catalog.initialize(builtin, defaults)
    const id = await first.catalog.addCard({ ...builtin, name: 'Unsynced Luna' })
    const second = context()
    second.account('alice')
    await second.catalog.initialize(builtin, defaults)
    expect(second.catalog.cards.get(id)?.name).toBe('Unsynced Luna')
    expect(second.catalog.currentRecord?.writes[id]).toHaveLength(1)
    expect(second.catalog.cards.get(id)?.extensions.airi.modules.consciousness).toEqual({ provider: '', model: '' })
  })
})
