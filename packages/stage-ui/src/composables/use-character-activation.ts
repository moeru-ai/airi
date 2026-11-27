import { storeToRefs } from 'pinia'
import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { useAiriCardStore } from '../stores/modules/airi-card'

/**
 * Makes a picked character the active character, for every `CharacterRail`: over the stage, beside the floating chat,
 * and beside the chat list of the classic window and of the phone drawer.
 *
 * A pick of the active character does nothing. A pick while a switch runs waits, and the last such pick runs after the
 * switch. A failed switch tells the user with a toast and keeps the earlier character.
 */
export function useCharacterActivation() {
  const cardStore = useAiriCardStore()
  const { activeCardId } = storeToRefs(cardStore)
  const { t } = useI18n()
  const switching = shallowRef(false)
  /** The last pick while a switch runs. */
  let waitingPick: string | undefined

  async function activateCharacter(characterId: string) {
    if (switching.value) {
      waitingPick = characterId
      return
    }
    if (characterId === activeCardId.value)
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
    const next = waitingPick
    waitingPick = undefined
    if (next !== undefined)
      await activateCharacter(next)
  }

  return { switching, activateCharacter }
}
