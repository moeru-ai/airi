import type { VirtualizerHandle } from 'virtua/vue'
import type { Ref, ShallowRef } from 'vue'

import { useMutationObserver, useRafFn, useResizeObserver } from '@vueuse/core'
import { shallowRef, watch } from 'vue'

interface VirtualScrollRequest {
  align: 'start' | 'end'
  index: number
}

interface VirtualizerScrollOptions {
  /** Extra space reserved after an end-aligned item. */
  tailInset: Readonly<Ref<number>>
  /** Virtua handle that owns item measurement and scrolling. */
  virtualizer: Readonly<ShallowRef<VirtualizerHandle | null>>
}

interface VirtualizerBottomAlignmentOptions {
  container: Readonly<Ref<HTMLElement | null>>
  itemCount: Readonly<Ref<number>>
  virtualizer: Readonly<ShallowRef<VirtualizerHandle | null>>
}

/**
 * Queues the latest index scroll until Virtua has measured its viewport.
 *
 * Virtua exposes its component handle before its internal ResizeObserver stores
 * a non-zero viewport size. This adapter polls only while one request waits for that value.
 */
export function useVirtualizerScroll(
  { tailInset, virtualizer }: VirtualizerScrollOptions,
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

    currentVirtualizer.scrollToIndex(request.index, {
      align: request.align,
      offset: request.align === 'end' ? Math.max(0, tailInset.value) : 0,
    })
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

/**
 * Bottom-aligns a virtualized list while its measured content is shorter than its viewport.
 *
 * The returned item props translate every mounted item by the same amount, so Virtua keeps
 * ownership of item measurement, absolute positioning, and overflow behavior.
 */
export function useVirtualizerBottomAlignment({
  container,
  itemCount,
  virtualizer,
}: VirtualizerBottomAlignmentOptions) {
  const bottomOffset = shallowRef(0)
  const renderedItems = shallowRef<HTMLElement[]>([])

  const { pause, resume } = useRafFn(() => {
    const currentVirtualizer = virtualizer.value
    const lastIndex = itemCount.value - 1
    if (!currentVirtualizer || lastIndex < 0 || currentVirtualizer.viewportSize <= 0) {
      bottomOffset.value = 0
      pause()
      return
    }

    const contentSize = currentVirtualizer.getItemOffset(lastIndex) + currentVirtualizer.getItemSize(lastIndex)

    // NOTICE:
    // Virtua keeps its content root at least as tall as the viewport, even for a short list.
    // Its absolute item offsets therefore remain top-aligned after scrollToIndex(..., { align: 'end' }).
    // Source: node_modules/virtua/src/core/store.ts getScrollSize and src/vue/Virtualizer.ts.
    // Remove this translation when Virtua provides native short-list bottom alignment.
    bottomOffset.value = Math.max(0, currentVirtualizer.viewportSize - contentSize)
    pause()
  }, { immediate: false })

  useMutationObserver(container, () => {
    renderedItems.value = Array.from(container.value?.querySelectorAll<HTMLElement>('.chat-message-item') ?? [])
    resume()
  }, { childList: true, subtree: true })
  useResizeObserver(container, resume)
  useResizeObserver(renderedItems, resume)
  watch([container, itemCount], resume, { flush: 'post', immediate: true })

  return {
    itemProps: () => ({
      style: {
        transform: bottomOffset.value > 0
          ? `translateY(max(0px, calc(${bottomOffset.value}px - var(--chat-history-bottom-inset, 0px))))`
          : undefined,
      },
    }),
  }
}
