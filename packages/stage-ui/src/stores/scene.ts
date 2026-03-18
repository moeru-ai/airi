import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed } from 'vue'

export interface SceneBackground {
  id: string
  url: string // Data URL or Blob URL
  name: string
}

export const useSceneStore = defineStore('scene', () => {
  const backgrounds = useLocalStorageManualReset<Map<string, SceneBackground>>('scene/backgrounds', new Map())
  const globalBackgroundId = useLocalStorageManualReset<string | null>('scene/globalBackgroundId', null)
  const activeBackgroundId = useLocalStorageManualReset<string | null>('scene/activeBackgroundId', null)

  const activeBackground = computed(() => {
    if (!activeBackgroundId.value)
      return null
    return backgrounds.value.get(activeBackgroundId.value) ?? null
  })

  const activeBackgroundUrl = computed(() => activeBackground.value?.url ?? null)

  function addBackground(url: string, name: string) {
    const id = nanoid()
    const nextBackgrounds = new Map(backgrounds.value)
    nextBackgrounds.set(id, { id, url, name })
    backgrounds.value = nextBackgrounds
    if (!globalBackgroundId.value) {
      globalBackgroundId.value = id
    }
    return id
  }

  function removeBackground(id: string) {
    const nextBackgrounds = new Map(backgrounds.value)
    nextBackgrounds.delete(id)
    backgrounds.value = nextBackgrounds
    if (globalBackgroundId.value === id) {
      globalBackgroundId.value = nextBackgrounds.keys().next().value || null
    }
    if (activeBackgroundId.value === id) {
      activeBackgroundId.value = globalBackgroundId.value
    }
  }

  function setActiveBackground(id: string | null) {
    activeBackgroundId.value = id
  }

  function setGlobalBackground(id: string | null) {
    globalBackgroundId.value = id
  }

  function resetState() {
    backgrounds.reset()
    globalBackgroundId.reset()
    activeBackgroundId.reset()
  }

  return {
    backgrounds,
    globalBackgroundId,
    activeBackgroundId,
    activeBackground,
    activeBackgroundUrl,
    addBackground,
    removeBackground,
    setActiveBackground,
    setGlobalBackground,
    resetState,
  }
})
