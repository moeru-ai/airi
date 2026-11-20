import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { useDisplayModelsStore } from '../stores/display-models'
import { useAiriCardStore } from '../stores/modules/airi-card'

/**
 * Maps each character ID to the preview image of its default display model.
 *
 * Surfaces that show a character avatar read it here, so every surface shows the same image. A character whose model
 * has no preview maps to `undefined`, and the surface shows its fallback.
 *
 * The previews come from the display model list that the runtime of the window reads at startup.
 */
export function useCharacterPreviews() {
  const { cards } = storeToRefs(useAiriCardStore())
  const { displayModels } = storeToRefs(useDisplayModelsStore())

  return computed(() => {
    const previews = new Map<string, string | undefined>()
    for (const [id, card] of cards.value) {
      const avatarModel = card.extensions.airi.avatarModels.find(model => model.id === card.extensions.airi.defaultAvatarModelId)
      previews.set(id, displayModels.value.find(model => model.id === avatarModel?.displayModelId)?.previewImage)
    }
    return previews
  })
}
