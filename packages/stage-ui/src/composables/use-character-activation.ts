import { storeToRefs } from 'pinia'
import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { useAiriCardStore } from '../stores/modules/airi-card'

/**
 * Makes a picked character the active character, for a `CharacterRail` over the stage or beside the floating chat.
 *
 * A pick while a switch runs, or a pick of the active character, does nothing. A failed switch tells the user with a
 * toast and keeps the earlier character.
 */
export function useCharacterActivation() {
  const cardStore = useAiriCardStore()
  const { activeCardId } = storeToRefs(cardStore)
  const { t } = useI18n()
  const switching = shallowRef(false)

  async function activateCharacter(characterId: string) {
    if (switching.value || characterId === activeCardId.value)
      return
    switching.value = true
    try {
      if (!await cardStore.activateCard(characterId))
        toast.error(t('stage.character-switcher.failed'))
    }
    catch {
      toast.error(t('stage.character-switcher.failed'))
    }
    finally {
      switching.value = false
    }
  }

  return { switching, activateCharacter }
}
