import { nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

export function useRestoreScroll() {
  const route = useRoute()

  const scrollContainer = ref<HTMLElement | null>(null)

  const scrollPositions = new Map<string, number>()

  watch(
    () => route.fullPath,
    async (newPath, oldPath) => {
      if (!scrollContainer.value) {
        return
      }

      scrollPositions.set(oldPath, scrollContainer.value.scrollTop)

      await nextTick()

      const savedPosition = scrollPositions.get(newPath) || 0
      scrollContainer.value.scrollTop = savedPosition
    },
  )

  return {
    scrollContainer,
  }
}
