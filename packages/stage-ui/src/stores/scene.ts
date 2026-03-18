import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

export const useSceneStore = defineStore('scene', () => {
  const activeBackgroundUrl = useLocalStorageManualReset<string | null>('scene/activeBackgroundUrl', null)

  function setBackground(url: string | null) {
    activeBackgroundUrl.value = url
  }

  function clearBackground() {
    activeBackgroundUrl.value = null
  }

  function resetState() {
    activeBackgroundUrl.reset()
  }

  return {
    activeBackgroundUrl,
    setBackground,
    clearBackground,
    resetState,
  }
})
