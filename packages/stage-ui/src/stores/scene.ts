import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import cozyTeaCornerInPastelHuesUrl from '../assets/backgrounds/cozy-tea-corner-in-pastel-hues.png'
import cuteStreamingRoomWithPastelDecorUrl from '../assets/backgrounds/cute-streaming-room-with-pastel-decor.png'

export interface SceneBackground {
  id: string
  url: string // Data URL or Blob URL
  name: string
}

const BUILTIN_BACKGROUNDS: SceneBackground[] = [
  {
    id: 'builtin:cozy-tea-corner',
    url: cozyTeaCornerInPastelHuesUrl,
    name: 'Cozy tea corner in pastel hues',
  },
  {
    id: 'builtin:cute-streaming-room',
    url: cuteStreamingRoomWithPastelDecorUrl,
    name: 'Cute streaming room with pastel decor',
  },
]

export const useSceneStore = defineStore('scene', () => {
  const backgrounds = useLocalStorageManualReset<Map<string, SceneBackground>>('scene/backgrounds', new Map())
  const globalBackgroundId = useLocalStorageManualReset<string | null>('scene/globalBackgroundId', null)
  const activeBackgroundId = useLocalStorageManualReset<string | null>('scene/activeBackgroundId', null)

  function ensureBuiltinBackgrounds() {
    let nextBackgrounds: Map<string, SceneBackground> | undefined

    for (const background of BUILTIN_BACKGROUNDS) {
      if (backgrounds.value.has(background.id))
        continue

      nextBackgrounds ??= new Map(backgrounds.value)
      nextBackgrounds.set(background.id, background)
    }

    if (!nextBackgrounds)
      return

    backgrounds.value = nextBackgrounds

    if (!globalBackgroundId.value) {
      globalBackgroundId.value = BUILTIN_BACKGROUNDS[0]?.id ?? null
    }
  }

  ensureBuiltinBackgrounds()

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
