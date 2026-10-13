import { errorMessageFrom } from '@moeru/std'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useLocalStorage } from '@vueuse/core'

import { personalCharacter } from './character'

/**
 * Persisted install state of the personal character, shared by all windows
 * through local storage.
 *
 * - `cardId`: the id that the card store gave the personal card.
 * - `fingerprint`: the bundled character that was last applied. A new build
 *   with another character has another fingerprint.
 */
function usePersonalInstallState() {
  return {
    cardId: useLocalStorage('personal/character-card-id', ''),
    fingerprint: useLocalStorage('personal/setup-fingerprint', ''),
  }
}

/**
 * Applies the bundled character when it differs from the last applied build.
 *
 * - First start: adds the card and selects it.
 * - Changed files: replaces the stored card. This removes edits made to that
 *   card in Settings. The selected card does not change.
 * - Card deleted in Settings: adds it again only after the files change.
 * - Unchanged files: does nothing, so choices made in Settings stay.
 */
async function installCharacter() {
  const state = usePersonalInstallState()
  const fingerprint = JSON.stringify({ character: personalCharacter })
  if (state.fingerprint.value === fingerprint)
    return

  const cardStore = useAiriCardStore()
  const card = {
    ...personalCharacter,
    extensions: { airi: { modules: {}, agents: {} } },
  }

  const existingCardId = state.cardId.value
  if (existingCardId && cardStore.getCard(existingCardId)) {
    await cardStore.updateCard(existingCardId, card)
  }
  else {
    const cardId = await cardStore.addCard(card, 'import')
    state.cardId.value = cardId
    await cardStore.activateCard(cardId)
  }

  state.fingerprint.value = fingerprint
}

/**
 * Starts the personal companion features in a full stage window.
 *
 * Only the synchronization leader installs the character, because card
 * changes must come from one window.
 *
 * @returns A function that stops the features. Call it when the window runtime is disposed.
 */
export async function initializePersonalCompanion(options: { isLeader: boolean }): Promise<() => void> {
  if (options.isLeader) {
    try {
      await installCharacter()
    }
    catch (error) {
      // A broken personal setup must not stop the app from starting.
      console.error('[personal] Failed to install the personal character:', errorMessageFrom(error) ?? 'unknown error')
    }
  }

  return () => {}
}
