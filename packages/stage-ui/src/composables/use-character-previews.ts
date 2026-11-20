import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'

import { useDisplayModelsStore } from '../stores/display-models'
import { useAiriCardStore } from '../stores/modules/airi-card'

/**
 * Maps each character ID to the preview image of its default display model.
 *
 * Surfaces that show a character avatar read it here, so every surface shows the same image. A character whose model
 * has no preview maps to `undefined`, and the surface shows its fallback.
 *
 * The previews come from the display model list in IndexedDB. A window with the minimal stage runtime, for example the
 * chat window of Stage Tamagotchi, does not read that list at startup, so the surface reads it when it mounts.
 */
export function useCharacterPreviews() {
  const displayModelsStore = useDisplayModelsStore()
  const { cards } = storeToRefs(useAiriCardStore())
  const { displayModels } = storeToRefs(displayModelsStore)

  onMounted(() => {
    void displayModelsStore.loadDisplayModelsFromIndexedDB()
  })

  return computed(() => {
    const previews = new Map<string, string | undefined>()
    for (const [id, card] of cards.value) {
      const avatarModel = card.extensions.airi.avatarModels.find(model => model.id === card.extensions.airi.defaultAvatarModelId)
      previews.set(id, displayModels.value.find(model => model.id === avatarModel?.displayModelId)?.previewImage)
    }
    return previews
  })
}
