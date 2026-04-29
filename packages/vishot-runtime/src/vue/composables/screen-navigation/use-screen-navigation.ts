import type { Ref } from 'vue'

import { computed, ref, unref } from 'vue'

export interface SceneNavigationScene {
  id: string
  title: string
}

export interface UseSceneNavigationOptions<TScene extends SceneNavigationScene> {
  currentSceneId: Ref<string>
  onNavigate: Ref<(sceneId: string) => void> | ((sceneId: string) => void)
  scenes: Ref<readonly TScene[]> | readonly TScene[]
}

export function useSceneNavigation<TScene extends SceneNavigationScene>(
  options: UseSceneNavigationOptions<TScene>,
) {
  const searchQuery = ref('')
  const resolvedScenes = computed(() => unref(options.scenes))
  const resolvedNavigate = computed(() => unref(options.onNavigate))

  const normalizedQuery = computed(() => searchQuery.value.trim().toLowerCase())
  const activeScene = computed(() => resolvedScenes.value.find(scene => scene.id === options.currentSceneId.value))
  const activeSceneLabel = computed(() => activeScene.value?.title ?? 'Unknown scene')
  const activeIndex = computed(() => resolvedScenes.value.findIndex(scene => scene.id === options.currentSceneId.value))

  const prevScene = computed(() => (
    activeIndex.value > 0 ? resolvedScenes.value[activeIndex.value - 1] : undefined
  ))
  const nextScene = computed(() => (
    activeIndex.value >= 0 && activeIndex.value < resolvedScenes.value.length - 1
      ? resolvedScenes.value[activeIndex.value + 1]
      : undefined
  ))

  const canGoPrev = computed(() => prevScene.value !== undefined)
  const canGoNext = computed(() => nextScene.value !== undefined)

  const filteredScenes = computed(() => {
    if (!normalizedQuery.value) {
      return resolvedScenes.value
    }

    return resolvedScenes.value.filter(scene => (
      scene.id.toLowerCase().includes(normalizedQuery.value)
      || scene.title.toLowerCase().includes(normalizedQuery.value)
    ))
  })

  const paletteItems = computed(() => {
    const filtered = filteredScenes.value
    const activeId = options.currentSceneId.value
    const active = filtered.find(scene => scene.id === activeId)

    if (!active) {
      return filtered
    }

    return [
      active,
      ...filtered.filter(scene => scene.id !== activeId),
    ]
  })

  function goToScene(sceneId: string) {
    resolvedNavigate.value(sceneId)
  }

  function goPrev() {
    if (prevScene.value) {
      goToScene(prevScene.value.id)
    }
  }

  function goNext() {
    if (nextScene.value) {
      goToScene(nextScene.value.id)
    }
  }

  return {
    activeScene,
    activeSceneLabel,
    canGoNext,
    canGoPrev,
    filteredScenes,
    goNext,
    goPrev,
    goToScene,
    nextScene,
    paletteItems,
    prevScene,
    searchQuery,
  }
}
