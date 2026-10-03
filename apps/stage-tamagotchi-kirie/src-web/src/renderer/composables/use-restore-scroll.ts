import type { MaybeRefOrGetter } from 'vue'

import { nextTick, toRef, watch } from 'vue'
import { useRoute } from 'vue-router'

const scrollPositions = new Map<string, number>()

export function useRestoreScroll(scrollContainer: MaybeRefOrGetter<HTMLElement | null | undefined>) {
  const route = useRoute()
  const scrollContainerRef = toRef(scrollContainer)

  watch(
    () => route.fullPath,
    async (newPath, oldPath) => {
      if (!scrollContainerRef.value) {
        return
      }

      if (oldPath) {
        scrollPositions.set(oldPath, scrollContainerRef.value.scrollTop)
      }

      await nextTick()

      if (!scrollContainerRef.value) {
        return
      }

      const savedPosition = scrollPositions.get(newPath) || 0
      scrollContainerRef.value.scrollTop = savedPosition
    },
  )

  return {
    scrollContainer,
  }
}
