import type { CardModuleDefaults } from '../../services/airi-card-modules'
import type { AiriCard, AiriExtension } from '../../types/airiCard'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { StorageSerializers } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'

/** Shared character definitions and defaults. Commands never select a character in a window. */
export const useAiriCardCatalog = defineStore('airi-card-catalog', () => {
  const cards = useLocalStorageManualReset<Map<string, AiriCard>>('airi-cards', new Map(), { listenToStorageChanges: false })
  const moduleDefaults = useLocalStorageManualReset<CardModuleDefaults | null>('airi-card-module-defaults', null, {
    listenToStorageChanges: false,
    serializer: StorageSerializers.object,
  })

  async function initialize(card: AiriCard, defaults: CardModuleDefaults) {
    if (!cards.value.has('default'))
      cards.value.set('default', card)
    if (!moduleDefaults.value)
      moduleDefaults.value = defaults
  }

  async function addCard(card: AiriCard) {
    const id = nanoid()
    cards.value.set(id, card)
    return id
  }

  async function updateCard(id: string, card: AiriCard) {
    if (!cards.value.has(id))
      return false
    cards.value.set(id, card)
    return true
  }

  async function updateModules(id: string, modules: Partial<AiriExtension['modules']>) {
    const card = cards.value.get(id)
    if (!card)
      return false
    cards.value.set(id, {
      ...card,
      extensions: {
        ...card.extensions,
        airi: {
          ...card.extensions.airi,
          modules: { ...card.extensions.airi.modules, ...modules },
        },
      },
    })
    return true
  }

  async function removeCard(id: string) {
    return id !== 'default' && cards.value.delete(id)
  }

  async function updateDefaults(defaults: CardModuleDefaults) {
    moduleDefaults.value = defaults
  }

  async function resetState() {
    cards.reset()
    moduleDefaults.reset()
  }

  return { cards, moduleDefaults, initialize, addCard, updateCard, updateModules, removeCard, updateDefaults, resetState }
}, {
  synced: {
    state: true,
    actions: ['initialize', 'addCard', 'updateCard', 'updateModules', 'removeCard', 'updateDefaults', 'resetState'],
  },
})
