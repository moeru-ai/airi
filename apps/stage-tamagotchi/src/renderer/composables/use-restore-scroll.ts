import { nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const scrollPositions = new Map<string, number>()

export function useRestoreScroll() {
  const route = useRoute()

  const scrollContainer = ref<HTMLElement | null>(null)

  watch(
    () => route.fullPath,
    async (newPath, oldPath) => {
      if (!scrollContainer.value) {
        return
      }

      if (oldPath) {
        scrollPositions.set(oldPath, scrollContainer.value.scrollTop)
      }

      await nextTick()

      if (!scrollContainer.value) {
        return
      }

      const savedPosition = scrollPositions.get(newPath) || 0
      scrollContainer.value.scrollTop = savedPosition
    },
  )

  return {
    scrollContainer,
  }
}
