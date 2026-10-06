import type {} from 'pinia-plugin-synced'

import type { DocumentSyncClient } from '../libs/document-sync'

import { errorMessageFrom } from '@moeru/std'
import { useDocumentVisibility, watchDebounced } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { documentSyncRepo } from '../database/repos/document-sync.repo'
import { authedFetch } from '../libs/auth-fetch'
import { splitCard } from '../libs/character-card-sync'
import { createDocumentSyncClient, synchronize } from '../libs/document-sync'
import { SERVER_URL } from '../libs/server'
import { useAuthStore } from './auth'
import { useAiriCardStore } from './modules/airi-card'

/** The route of the server that stores the cards. */
const CARDS_PATH = '/api/v1/character-cards'

/** Names the sync state of the cards in the local storage. */
const STATE_NAME = 'character-cards'

/**
 * Synchronizes the character cards with the account. The selected card is
 * not synchronized, so each device keeps its own selection.
 *
 * Use this store once in each application root. Every renderer requests a run
 * after sign-in, after a card change, and when its window becomes visible.
 * The synchronization leader executes the runs, one at a time. A user without
 * an account never sends a request.
 */
export const useCharacterCardSyncStore = defineStore('character-card-sync', () => {
  const { t } = useI18n()
  const { userId } = storeToRefs(useAuthStore())
  const cardStore = useAiriCardStore()
  const { cards, activeCardId } = storeToRefs(cardStore)
  const visibility = useDocumentVisibility()

  let client: DocumentSyncClient | undefined
  let activeRun: Promise<void> | undefined
  let hasQueuedRun = false

  /**
   * Compares the local cards with the server and exchanges the changes.
   *
   * A call during a run queues one more run and returns with the active run.
   * Errors are logged. The next request sends the same changes again.
   */
  async function synchronizeCards() {
    if (activeRun) {
      hasQueuedRun = true
      return activeRun
    }

    activeRun = (async () => {
      do {
        hasQueuedRun = false
        try {
          await runOnce(userId.value)
        }
        catch (error) {
          console.error('[character-card-sync] Synchronization failed:', errorMessageFrom(error))
        }
      } while (hasQueuedRun)
    })()

    try {
      await activeRun
    }
    finally {
      activeRun = undefined
    }
  }

  async function runOnce(ownerId: string) {
    if (ownerId === 'local')
      return

    client ??= createDocumentSyncClient({ serverUrl: SERVER_URL, path: CARDS_PATH, fetch: authedFetch })
    await synchronize({
      client,
      state: await documentSyncRepo.getState(STATE_NAME, ownerId) ?? { documents: {} },
      // The new account starts its own run from the `userId` watcher.
      isCurrent: () => userId.value === ownerId,
      saveState: state => documentSyncRepo.saveState(STATE_NAME, ownerId, state),
      readLocal: () => ({
        documents: Object.fromEntries([...toRaw(cards.value)].map(([id, card]) => [id, splitCard(toRaw(card))])),
        pristine: { default: splitCard(cardStore.builtInCard) },
      }),
      async applyLocal(changes) {
        const activeCardChanged = cardStore.applySynchronizedCards(changes)
        if (changes.conflictCopies.length > 0)
          toast.warning(t('settings.pages.card.sync.conflict_notice'))
        if (activeCardChanged)
          await cardStore.activateCard(activeCardId.value)
      },
    })
  }

  async function requestSynchronization() {
    if (userId.value === 'local')
      return

    try {
      await useCharacterCardSyncStore().synchronizeCards()
    }
    catch (error) {
      console.error('[character-card-sync] Failed to request synchronization:', errorMessageFrom(error))
    }
  }

  // Each renderer observes the synchronized identity and cards. The requests
  // go to the leader. A run that finds no difference changes nothing, so the
  // request that follows a remote change ends the sequence.
  watch(userId, requestSynchronization)
  watchDebounced(cards, requestSynchronization, { debounce: 1500, deep: true })
  watch(visibility, async (state) => {
    if (state === 'visible')
      await requestSynchronization()
  })
  // A restored session has its user id before this store exists, so no watcher
  // reports it. The store instance has no actions during setup, so wait for it.
  queueMicrotask(requestSynchronization)

  return { synchronizeCards }
}, {
  synced: {
    actions: ['synchronizeCards'],
  },
})
