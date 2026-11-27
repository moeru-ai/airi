import { storeToRefs } from 'pinia'
import { computed, shallowRef, watch } from 'vue'

import { useChatSessionStore } from '../stores/chat/session-store'
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
 * - `shownCharacterId`, the picked character, else the character of the open chat, else the character on the stage.
 * - `pick`, which changes only the list. The stage keeps its character until the user opens or starts a chat of the
 *   picked character.
 *
 * The pick ends when another chat opens, so the list follows the open chat again. The list shows the character of that
 * chat at once. The stage activates it later, after the chat loads, and a pick during the load stays.
 */
export function useListCharacter() {
  const { activeCardId, cards } = storeToRefs(useAiriCardStore())
  const chatSession = useChatSessionStore()
  const { activeSessionId } = storeToRefs(chatSession)
  const picked = shallowRef<string>()

  /** The character of the open chat. A chat of a character that this device does not have keeps the stage character. */
  const chatCharacterId = computed(() => {
    const [characterId] = chatSession.characterMembersOf(activeSessionId.value)
    return characterId && cards.value.has(characterId) ? characterId : undefined
  })
  const shownCharacterId = computed(() => picked.value ?? chatCharacterId.value ?? (activeCardId.value || 'default'))
  watch(activeSessionId, () => {
    picked.value = undefined
  })

  function pick(characterId: string) {
    picked.value = characterId
  }

  return { shownCharacterId, pick }
}
