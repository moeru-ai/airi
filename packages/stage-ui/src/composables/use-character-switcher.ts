import { storeToRefs } from 'pinia'
import { computed, shallowRef } from 'vue'

import { useAuthStore } from '../stores/auth'
import { useChatSessionStore } from '../stores/chat/session-store'
import { useAiriCardStore } from '../stores/modules/airi-card'
import { useCharacterPreviews } from './use-character-previews'

/** One character in a list that switches the active character. */
export interface CharacterSwitcherEntry {
  id: string
  name: string
  /** The preview image of the default display model. A character without one shows a fallback. */
  preview?: string
}

/**
 * Gives the character list and the switch action that every character switcher shares.
 *
 * The list puts characters with a recent visible conversation first. Characters without one keep the card order.
 */
export function useCharacterSwitcher() {
  const cardStore = useAiriCardStore()
  const { cards, activeCardId } = storeToRefs(cardStore)
  const { sessionMetas } = storeToRefs(useChatSessionStore())
  const { userId } = storeToRefs(useAuthStore())
  const previews = useCharacterPreviews()
  const switching = shallowRef(false)

  const lastActivityByCharacter = computed(() => {
    const effectiveUserId = userId.value || 'local'
    const activity = new Map<string, number>()
    for (const meta of Object.values(sessionMetas.value)) {
      // A hidden conversation is a background task. It is not a chat with the character.
      if (meta.userId !== effectiveUserId || meta.hidden)
        continue
      activity.set(meta.characterId, Math.max(activity.get(meta.characterId) ?? 0, meta.updatedAt))
    }
    return activity
  })

  const entries = computed<CharacterSwitcherEntry[]>(() => Array.from(cards.value, ([id, card], order) => ({
    id,
    name: card.name,
    preview: previews.value.get(id),
    lastActivity: lastActivityByCharacter.value.get(id) ?? 0,
    order,
  }))
    .sort((first, second) => second.lastActivity - first.lastActivity || first.order - second.order)
    .map(({ id, name, preview }) => ({ id, name, preview })))

  /**
   * Activates a character.
   *
   * - `switched`: the character is active now. The active character gives this result without work.
   * - `busy`: another activation runs, and this call did nothing.
   * - `failed`: the activation failed, and the previous character stays active.
   */
  async function select(id: string): Promise<'switched' | 'busy' | 'failed'> {
    if (switching.value)
      return 'busy'
    if (id === activeCardId.value)
      return 'switched'
    switching.value = true
    try {
      return await cardStore.activateCard(id) ? 'switched' : 'failed'
    }
    catch {
      return 'failed'
    }
    finally {
      switching.value = false
    }
  }

  return { entries, activeCardId, switching, select }
}
