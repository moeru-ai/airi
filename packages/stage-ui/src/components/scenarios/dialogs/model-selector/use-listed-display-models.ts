import type { DisplayModelFormat } from '../../../../stores/display-models'

import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'

import { useDisplayModelsStore } from '../../../../stores/display-models'

/** One display model in a list: a model on this device, or a model that only the account holds. */
export interface ListedDisplayModel {
  id: string
  name: string
  format: DisplayModelFormat
  previewImage?: string
  /** The account holds the model, and this device has no copy. The model downloads when a character needs it. */
  cloudOnly: boolean
}

/**
 * Gives the display models that a list shows: the models on this device first, then the models that only the account holds.
 *
 * It asks the account for its models when the host mounts, because another device can have added one.
 */
export function useListedDisplayModels() {
  const displayModelStore = useDisplayModelsStore()
  const { displayModels, cloudOnlyModels, displayModelsFromIndexedDBLoading } = storeToRefs(displayModelStore)

  const listedModels = computed<ListedDisplayModel[]>(() => [
    ...displayModels.value.map(model => ({ id: model.id, name: model.name, format: model.format, previewImage: model.previewImage, cloudOnly: false })),
    ...cloudOnlyModels.value.map(model => ({ id: model.id, name: model.name, format: model.format as DisplayModelFormat, previewImage: undefined, cloudOnly: true })),
  ])

  onMounted(() => displayModelStore.refreshCloudModels())

  return { listedModels, loading: displayModelsFromIndexedDBLoading }
}
