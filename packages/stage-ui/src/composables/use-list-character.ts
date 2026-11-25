import { storeToRefs } from 'pinia'
import { computed, shallowRef, watch } from 'vue'

import { useAiriCardStore } from '../stores/modules/airi-card'

/**
 * The character whose chats a list beside a docked `CharacterRail` shows.
 *
 * Use when:
 * - A docked rail and a chat list stand side by side, for example in the classic chat window or the phone drawer.
 *
 * Expects:
 * - The rail passes `shownCharacterId` as `selected` and calls `pick` on `select`. The list passes `shownCharacterId`
 *   as its character.
 *
 * Returns:
 * - `shownCharacterId`, the picked character, else the character on the stage.
 * - `pick`, which changes only the list. The stage keeps its character until the user opens or starts a chat of the
 *   picked character.
 *
 * The pick ends when the stage changes its character, so the list follows the stage again. Opening a chat selects the
 * chat at once and activates its character later. Ending the pick at the selection would show the chats of the earlier
 * character until the activation finishes.
 */
export function useListCharacter() {
  const { activeCardId } = storeToRefs(useAiriCardStore())
  const picked = shallowRef<string>()
  const shownCharacterId = computed(() => picked.value ?? (activeCardId.value || 'default'))
  watch(activeCardId, () => {
    picked.value = undefined
  })

  function pick(characterId: string) {
    picked.value = characterId
  }

  return { shownCharacterId, pick }
}
