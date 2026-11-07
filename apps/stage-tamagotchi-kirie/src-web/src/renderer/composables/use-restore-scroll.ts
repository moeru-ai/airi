import type { MaybeRefOrGetter } from 'vue'

import { toRef, watch } from 'vue'
import { useRoute } from 'vue-router'

const scrollPositions = new Map<string, number>()

export function useRestoreScroll(scrollContainer: MaybeRefOrGetter<HTMLElement | null | undefined>) {
  const route = useRoute()
  const scrollContainerRef = toRef(scrollContainer)

  // Save the position before the next page renders. A shorter page would clamp it.
  watch(
    () => route.fullPath,
    (_, oldPath) => {
      if (oldPath && scrollContainerRef.value)
        scrollPositions.set(oldPath, scrollContainerRef.value.scrollTop)
    },
  )

  // Restore the position after the page renders, in the same flush. A watcher that the layout adds later,
  // such as the settings search reveal, runs after this one and can scroll on from here.
  watch(
    () => route.fullPath,
    (newPath) => {
      if (scrollContainerRef.value)
        scrollContainerRef.value.scrollTop = scrollPositions.get(newPath) || 0
    },
    { flush: 'post' },
  )

  return {
    scrollContainer,
  }
}
