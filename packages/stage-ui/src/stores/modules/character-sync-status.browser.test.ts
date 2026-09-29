import type { ContactReplicaRecord } from '../../services/contact-replica'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'

import CharacterSyncStatus from '../../../../stage-pages/src/pages/settings/airi-card/components/character-sync-status.vue'

import { contactReplicaRepo } from '../../database/repos/contact-replica.repo'
import { storage } from '../../database/storage'
import { useAuthStore } from '../auth'
import { useAiriCardCatalog } from './airi-card-catalog'

const instances: ReturnType<typeof createPinia>[] = []
const modules = {
  consciousness: { provider: '', model: '' },
  vision: { provider: '', model: '' },
  speech: { provider: '', model: '', voice_id: '' },
}
const cloudCard = { name: 'Cloud Luna', version: '1', extensions: { airi: { modules, agents: {} } } }
const deviceCard = { ...cloudCard, name: 'Device Luna' }
const timestamp = '2026-09-28T00:00:00.000Z'

beforeEach(async () => {
  localStorage.clear()
  await storage.clear('local')
})

afterEach(() => {
  for (const pinia of instances.splice(0))
    disposePinia(pinia)
  vi.unstubAllGlobals()
})

describe('character synchronization controls', () => {
  it.each(['local', 'remote'] as const)('persists the chosen %s revision and completes synchronization', async (choice) => {
    const record: ContactReplicaRecord = {
      ownerId: 'owner',
      cards: { luna: deviceCard },
      contacts: { luna: {
        id: 'contact-luna',
        ownerId: 'owner',
        characterId: 'hosted-luna',
        localCharacterId: 'luna',
        revision: 2,
        lastMutationId: 'remote-edit',
        document: cloudCard,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      } },
      writes: { luna: [{ expectedRevision: 1, mutationId: 'local-edit', document: deviceCard }] },
      conflicts: ['luna'],
      deletions: [],
      deletedCharacterIds: [],
      deletedContactIds: [],
      deletedChatIds: [],
    }
    await contactReplicaRepo.save(record)
    const pinia = createPinia()
    instances.push(pinia)
    createApp({}).use(pinia).use(PiniaColada)
    const auth = useAuthStore(pinia)
    auth.user = { id: 'owner', name: 'Owner', email: 'owner@example.test', emailVerified: true, createdAt: new Date(), updatedAt: new Date() }
    auth.token = 'test-token'
    const catalog = useAiriCardCatalog(pinia)
    await catalog.initialize(cloudCard, modules)
    const fetchAsset = globalThis.fetch.bind(globalThis)
    let writes = 0
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (url.origin === location.origin)
        return fetchAsset(input, init)
      if (request.method === 'GET' && url.pathname === '/api/v1/contacts')
        return Response.json({ contacts: [record.contacts.luna] })
      if (request.method === 'PUT' && url.pathname === '/api/v1/contacts/characters/luna') {
        const command = await request.json()
        expect(command.expectedRevision).toBe(2)
        expect(command.document.name).toBe('Device Luna')
        writes += 1
        return Response.json({ ...record.contacts.luna, revision: 3, document: deviceCard, lastMutationId: command.mutationId })
      }
      throw new Error(`Unexpected request: ${request.method} ${url.pathname}`)
    }))
    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      messages: { en: { settings: { pages: { card: { sync: {
        'pending': 'Waiting for synchronization',
        'conflict': 'Choose the version of {name}',
        'keep-local': 'Keep device version',
        'use-cloud': 'Use cloud version',
        'retry': 'Synchronize now',
        'failed': 'Synchronization failed',
      } } } } } },
    })
    const screen = render(CharacterSyncStatus, { global: { plugins: [pinia, PiniaColada, i18n] } })
    await expect.element(screen.getByText('Choose the version of Device Luna')).toBeVisible()
    await screen.getByRole('button', { name: choice === 'local' ? 'Keep device version' : 'Use cloud version' }).click()
    await expect.element(screen.getByRole('button', { name: 'Synchronize now' })).not.toBeInTheDocument()
    expect(catalog.cards.get('luna')?.name).toBe(choice === 'local' ? 'Device Luna' : 'Cloud Luna')
    expect(catalog.currentRecord?.conflicts).toEqual([])
    expect(catalog.currentRecord?.writes).toEqual({})
    expect(writes).toBe(choice === 'local' ? 1 : 0)
    expect((await contactReplicaRepo.load('owner'))?.cards.luna.name).toBe(catalog.cards.get('luna')?.name)
  })
})
