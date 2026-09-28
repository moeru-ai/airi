import type { CardModuleDefaults } from '../../services/airi-card-modules'
import type { ContactReplica, ContactReplicaRecord } from '../../services/contact-replica'
import type { AiriCard, AiriExtension } from '../../types/airiCard'

import { errorMessageFrom } from '@moeru/std'
import { StorageSerializers } from '@vueuse/core'
import { cloneDeep } from 'es-toolkit'
import { nanoid } from 'nanoid'
import { defineStore, getActivePinia } from 'pinia'
import { computed, ref, watch } from 'vue'

import { contactReplicaRepo } from '../../database/repos/contact-replica.repo'
import { storage } from '../../database/storage'
import { authedFetch } from '../../libs/auth-fetch'
import { createContactClient } from '../../libs/contact-sync/client'
import { SERVER_URL } from '../../libs/server'
import { createContactReplica } from '../../services/contact-replica'
import { useAuthStore } from '../auth'

const emptyCards: ReadonlyMap<string, AiriCard> = new Map()

/** The leader owns durable account catalogs. Replicated snapshots never write storage or change window selection. */
export const useAiriCardCatalog = defineStore('airi-card-catalog', () => {
  const pinia = getActivePinia()
  const auth = useAuthStore()
  const record = ref<ContactReplicaRecord | null>(null)
  const builtin = ref<AiriCard | null>(null)
  const moduleDefaults = ref<CardModuleDefaults | null>(null)
  const syncError = ref<string | null>(null)
  let replica: ContactReplica | undefined
  let activation: { ownerId: string, task: Promise<void> } | undefined
  let generation = 0
  let migrationQueue = Promise.resolve()

  const cards = computed<ReadonlyMap<string, AiriCard>>(() => record.value?.ownerId === auth.userId
    ? new Map(Object.entries(record.value.cards))
    : emptyCards)
  const currentRecord = computed(() => record.value?.ownerId === auth.userId ? record.value : null)

  function publish(active: ContactReplica) {
    if (active === replica && active.snapshot().ownerId === auth.userId)
      record.value = active.snapshot()
  }

  async function activateAccount() {
    const ownerId = auth.userId
    if (!builtin.value)
      return
    if (replica && record.value?.ownerId === ownerId)
      return
    if (activation?.ownerId === ownerId)
      return activation.task
    const epoch = ++generation
    replica?.dispose()
    replica = undefined
    syncError.value = null
    const defaultCard = cloneDeep(builtin.value)
    const task = (async () => {
      const initialCards: Record<string, AiriCard> = { default: defaultCard }
      const migration = migrationQueue.then(async () => {
        const legacyOwner = await storage.getItem<string>('local:contacts/legacy-owner')
        const legacy = localStorage.getItem('airi-cards')
        if (legacy && (ownerId === 'local' || !legacyOwner || legacyOwner === ownerId)) {
          const legacyCards: Map<string, AiriCard> = StorageSerializers.map.read(legacy)
          Object.assign(initialCards, Object.fromEntries(legacyCards))
        }
        if (ownerId !== 'local' && (!legacyOwner || legacyOwner === ownerId)) {
          const anonymous = await contactReplicaRepo.load('local')
          if (anonymous) {
            Object.assign(initialCards, anonymous.cards)
            for (const deletedId of anonymous.deletedCharacterIds)
              delete initialCards[deletedId]
          }
          if (!legacyOwner)
            await storage.setItem('local:contacts/legacy-owner', ownerId)
        }
      })
      migrationQueue = migration.then(() => undefined, () => undefined)
      await migration
      const active = await createContactReplica(ownerId, initialCards, contactReplicaRepo)
      if (epoch !== generation || ownerId !== auth.userId) {
        active.dispose()
        return
      }
      replica = active
      publish(active)
    })()
    activation = { ownerId, task }
    try {
      await task
    }
    finally {
      if (activation?.task === task)
        activation = undefined
    }
  }

  async function activeReplica() {
    await activateAccount()
    if (!replica || record.value?.ownerId !== auth.userId)
      throw new Error('Character catalog has not initialized for this account')
    return replica
  }

  async function initialize(card: AiriCard, defaults: CardModuleDefaults) {
    if (!builtin.value)
      builtin.value = cloneDeep(card)
    if (!moduleDefaults.value) {
      const saved = localStorage.getItem('airi-card-module-defaults')
      moduleDefaults.value = saved ? StorageSerializers.object.read(saved) : cloneDeep(defaults)
    }
    await activateAccount()
  }

  async function addCard(card: AiriCard) {
    const active = await activeReplica()
    const id = nanoid()
    await active.put(id, cloneDeep(card))
    publish(active)
    return id
  }

  async function updateCard(id: string, card: AiriCard) {
    const active = await activeReplica()
    if (!active.snapshot().cards[id])
      return false
    await active.put(id, cloneDeep(card))
    publish(active)
    return true
  }

  async function updateModules(id: string, modules: Partial<AiriExtension['modules']>) {
    const card = cards.value.get(id)
    if (!card)
      return false
    return updateCard(id, {
      ...card,
      extensions: { ...card.extensions, airi: { ...card.extensions.airi, modules: { ...card.extensions.airi.modules, ...modules } } },
    })
  }

  async function removeCard(id: string) {
    if (id === 'default')
      return false
    const active = await activeReplica()
    if (!active.snapshot().cards[id])
      return false
    await active.delete(id)
    publish(active)
    return true
  }

  async function syncContacts() {
    const active = await activeReplica()
    const ownerId = active.snapshot().ownerId
    const version = auth.sessionVersion
    if (ownerId === 'local')
      return
    const client = createContactClient({
      serverUrl: SERVER_URL,
      fetch: (input, init) => {
        if (auth.userId !== ownerId || auth.sessionVersion !== version)
          throw new Error('Character sync account changed')
        return authedFetch(input, init)
      },
    })
    try {
      await active.sync(client)
      if (active === replica)
        syncError.value = null
    }
    catch (error) {
      if (active === replica)
        syncError.value = errorMessageFrom(error) ?? 'Character synchronization failed'
      throw error
    }
    finally {
      publish(active)
    }
  }

  async function resolveConflict(id: string, choice: 'local' | 'remote') {
    const active = await activeReplica()
    await active.resolveConflict(id, choice)
    publish(active)
  }

  async function updateDefaults(defaults: CardModuleDefaults) {
    const next = cloneDeep(defaults)
    localStorage.setItem('airi-card-module-defaults', StorageSerializers.object.write(next))
    moduleDefaults.value = next
  }

  async function resetState() {
    generation++
    replica?.dispose()
    replica = undefined
    await storage.removeItem(`local:contacts/catalog/${auth.userId}`)
    record.value = null
    builtin.value = null
    moduleDefaults.value = null
    localStorage.removeItem('airi-cards')
    localStorage.removeItem('airi-card-module-defaults')
  }

  watch(() => auth.userId, async () => {
    await useAiriCardCatalog(pinia).activateAccount()
  })

  return { cards, record, currentRecord, builtin, moduleDefaults, syncError, initialize, activateAccount, addCard, updateCard, updateModules, removeCard, syncContacts, resolveConflict, updateDefaults, resetState }
}, {
  synced: {
    state: true,
    actions: ['initialize', 'activateAccount', 'addCard', 'updateCard', 'updateModules', 'removeCard', 'syncContacts', 'resolveConflict', 'updateDefaults', 'resetState'],
  },
})
