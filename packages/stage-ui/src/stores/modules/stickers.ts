import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { chatStickers } from '../../assets/stickers'

/** Device-local preference. Existing storage events propagate changes between renderer windows. */
export const useStickersStore = defineStore('stickers', () => {
  const enabled = useLocalStorageManualReset('settings/stickers/enabled', false)
  const catalog = computed(() => enabled.value ? chatStickers : undefined)

  function resetState() {
    enabled.value = false
  }

  return { enabled, catalog, resetState }
})
