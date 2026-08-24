import type { VirtualizerHandle } from 'virtua/vue'
import type { ShallowRef } from 'vue'

import { useRafFn } from '@vueuse/core'
import { shallowRef } from 'vue'

interface VirtualScrollRequest {
  align: 'start' | 'end'
  index: number
}

/**
 * Queues the latest index scroll until Virtua has measured its viewport.
 *
 * Virtua exposes its component handle before its internal ResizeObserver stores
 * a non-zero viewport size. This adapter polls only while one request waits for that value.
 */
export function useVirtualizerScroll(
  virtualizer: Readonly<ShallowRef<VirtualizerHandle | null>>,
) {
  let didObserveReadyFrame = false
  const pendingRequest = shallowRef<VirtualScrollRequest>()
  const { pause, resume } = useRafFn(() => {
    const currentVirtualizer = virtualizer.value
    const request = pendingRequest.value
    if (!request) {
      pause()
      return
    }

    if (!currentVirtualizer || currentVirtualizer.viewportSize <= 0) {
      didObserveReadyFrame = false
      return
    }

    // Virtua schedules its item measurements after it stores viewportSize.
    // Wait for one complete frame with a measured viewport before issuing the command.
    if (!didObserveReadyFrame) {
      didObserveReadyFrame = true
      return
    }

    currentVirtualizer.scrollToIndex(request.index, { align: request.align })
    pendingRequest.value = undefined
    didObserveReadyFrame = false
    pause()
  }, { immediate: false })

  return {
    scrollToIndex(index: number, align: 'start' | 'end') {
      pendingRequest.value = { align, index }
      didObserveReadyFrame = false
      resume()
    },
  }
}
