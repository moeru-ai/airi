import type { Ref, ShallowRef } from 'vue'

import { useEventListener, useMutationObserver, useRafFn, useResizeObserver } from '@vueuse/core'
import { shallowRef, watch } from 'vue'

function useObservedElements(
  root: Readonly<ShallowRef<HTMLElement | null>>,
  selector: string,
) {
  const elements = shallowRef<HTMLElement[]>([])

  const collectElements = () => {
    const currentRoot = root.value
    elements.value = currentRoot
      ? Array.from(currentRoot.querySelectorAll<HTMLElement>(selector))
      : []
  }

  watch(root, collectElements, { flush: 'post', immediate: true })
  useMutationObserver(root, collectElements, {
    childList: true,
    subtree: true,
  })

  return elements
}

/**
 * Updates the mask stops for the message containers inside one chat viewport.
 *
 * The mask stays mounted during scrolling. One animation-frame callback combines
 * all scroll, resize, and virtualized-child changes before it reads layout.
 */
export function useChatHistoryTopFade({
  container,
  fadeRatio,
}: {
  container: Readonly<ShallowRef<HTMLElement | null>>
  fadeRatio: Readonly<Ref<number>>
}) {
  const messageContainers = useObservedElements(container, '.chat-message-item-container')

  const { resume: updateOnNextFrame } = useRafFn(() => {
    const currentContainer = container.value
    if (!currentContainer)
      return

    const fadeHeight = currentContainer.clientHeight * fadeRatio.value
    const containerTop = currentContainer.getBoundingClientRect().top

    for (const messageContainer of messageContainers.value) {
      const messageTop = messageContainer.getBoundingClientRect().top - containerTop

      // NOTICE:
      // Keep the mask declaration mounted while a message crosses the scroll boundary.
      // Chromium can flash when backdrop-filter and mask layers change during a scroll frame.
      // Source: https://issues.chromium.org/issues/483220231.
      // Remove this workaround when browsers provide stable spatial blur without mask layers.
      const transparentStop = fadeHeight > 0 && messageTop < fadeHeight ? -messageTop : -1
      const opaqueStop = fadeHeight > 0 && messageTop < fadeHeight ? fadeHeight - messageTop : 0
      messageContainer.style.setProperty('--chat-top-fade-transparent-stop', `${transparentStop}px`)
      messageContainer.style.setProperty('--chat-top-fade-opaque-stop', `${opaqueStop}px`)
    }
  }, { immediate: false, once: true })

  useEventListener(container, 'scroll', updateOnNextFrame, { passive: true })
  useResizeObserver(
    () => {
      const currentContainer = container.value
      return currentContainer
        ? [currentContainer, ...messageContainers.value]
        : messageContainers.value
    },
    updateOnNextFrame,
  )
  watch([messageContainers, fadeRatio], updateOnNextFrame, {
    flush: 'post',
    immediate: true,
  })
}
