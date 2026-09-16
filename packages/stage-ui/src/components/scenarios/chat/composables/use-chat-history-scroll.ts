import type { Ref } from 'vue'

import { useEventListener, useMutationObserver, useResizeObserver } from '@vueuse/core'
import { computed, shallowRef, watch } from 'vue'

interface ChatHistoryScrollOptions<TMessage> {
  container: Readonly<Ref<HTMLElement | null>>
  messages: Readonly<Ref<TMessage[]>>
  getKey: (message: TMessage, index: number) => string | number
  scrollToIndex: (index: number, align: 'start' | 'end') => void
  /** Space that a floating composer covers at the end of the viewport. */
  tailInset: Readonly<Ref<number>>
}

/**
 * Keeps chat history scrolling aligned with the reader's current intent.
 *
 * A user scroll away from the tail disables automatic movement. Layout changes
 * and index scrolls do not disable it. Pointer, focus, and selection on an older
 * message also block movement until that inspection ends.
 * The returned onUserScroll must receive custom scrollbar pointer events before
 * their default handler changes the viewport position.
 */
export function useChatHistoryScroll<TMessage>({
  container,
  messages,
  getKey,
  scrollToIndex,
  tailInset,
}: ChatHistoryScrollOptions<TMessage>) {
  let didRequestInitialScroll = false
  let hasUserScrollIntent = false
  let isFollowingConversation = true
  let isFollowingTail = true
  let isPointerOrFocusOnOlderMessage = false
  let isSelectionInOlderMessage = false
  let previousContainer: HTMLElement | null = null
  let previousLastMessageKey: string | number | null = null

  const selectionDocument = computed(() => container.value?.ownerDocument)

  // Message layout can change after the model watcher and Virtua's pending
  // scroll finish (for example, fonts or rendered content arrive later).
  // These scope-owned observers follow mounted messages without overriding
  // a reader who scrolled away, focused history, or selected older text.
  const renderedMessages = shallowRef<HTMLElement[]>([])
  const measuredHeights = new WeakMap<Element, number>()
  const observeRenderedMessages = () => {
    const currentContainer = container.value
    if (!currentContainer) {
      renderedMessages.value = []
      return
    }
    renderedMessages.value = Array.from(currentContainer.querySelectorAll<HTMLElement>('.chat-message-item'))
  }
  useMutationObserver(container, observeRenderedMessages, { childList: true, subtree: true })
  watch(container, observeRenderedMessages, { flush: 'post', immediate: true })
  useResizeObserver(renderedMessages, (entries) => {
    let heightChanged = false
    for (const { target, contentRect } of entries) {
      const previousHeight = measuredHeights.get(target)
      measuredHeights.set(target, contentRect.height)
      if (previousHeight !== undefined && previousHeight !== contentRect.height)
        heightChanged = true
    }

    if (!heightChanged || !didRequestInitialScroll || !isFollowingConversation || isPointerOrFocusOnOlderMessage || isSelectionInOlderMessage)
      return

    const lastIndex = messages.value.length - 1
    if (lastIndex >= 0)
      scrollToIndex(lastIndex, 'end')
  })

  const isNearTail = (currentContainer: HTMLElement) => {
    // NOTICE: This tolerance absorbs sub-pixel layout changes, font swaps, and late content growth.
    return currentContainer.scrollTop + currentContainer.clientHeight >= currentContainer.scrollHeight - 24
  }

  const findMessageItem = (target: EventTarget | Node | null) => {
    if (!(target instanceof Node))
      return null

    const currentContainer = container.value
    const element = target instanceof Element ? target : target.parentElement
    const messageItem = element?.closest<HTMLElement>('.chat-message-item') ?? null
    return messageItem && currentContainer?.contains(messageItem) ? messageItem : null
  }

  const isOlderMessageItem = (messageItem: HTMLElement | null) => {
    if (!messageItem || !isFollowingTail)
      return !!messageItem

    const messageItems = container.value?.querySelectorAll<HTMLElement>('.chat-message-item')
    return messageItem !== messageItems?.item((messageItems.length ?? 0) - 1)
  }

  useEventListener(container, 'scroll', () => {
    const currentContainer = container.value
    if (!currentContainer)
      return

    isFollowingTail = isNearTail(currentContainer)
    if (isFollowingTail) {
      isFollowingConversation = true
      hasUserScrollIntent = false
      if (!isSelectionInOlderMessage)
        isPointerOrFocusOnOlderMessage = false
    }
    else if (hasUserScrollIntent) {
      isFollowingConversation = false
    }
  }, { passive: true })

  // The custom scrollbar is a sibling of the viewport. Its owner calls this
  // before Reka changes scrollTop; viewport wheel and touch events share it.
  const onUserScroll = (event: PointerEvent | WheelEvent | TouchEvent) => {
    if (event instanceof PointerEvent && event.button !== 0)
      return
    hasUserScrollIntent = true
  }
  useEventListener(container, ['wheel', 'touchmove'], onUserScroll, { passive: true })

  useEventListener(container, 'keydown', (event) => {
    if (['ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp', ' '].includes(event.key))
      hasUserScrollIntent = true
  })

  useEventListener(container, 'pointerover', (event) => {
    isPointerOrFocusOnOlderMessage = isOlderMessageItem(findMessageItem(event.target))
  })
  useEventListener(container, 'pointerout', (event) => {
    isPointerOrFocusOnOlderMessage = isOlderMessageItem(findMessageItem(event.relatedTarget))
  })
  useEventListener(container, 'focusin', (event) => {
    isPointerOrFocusOnOlderMessage = isOlderMessageItem(findMessageItem(event.target))
  })
  useEventListener(container, 'focusout', (event) => {
    isPointerOrFocusOnOlderMessage = isOlderMessageItem(findMessageItem(event.relatedTarget))
  })
  useEventListener(selectionDocument, 'selectionchange', () => {
    const selection = selectionDocument.value?.getSelection()
    isSelectionInOlderMessage = isOlderMessageItem(findMessageItem(selection?.anchorNode ?? null))
  })

  watch(
    [container, messages, tailInset],
    ([currentContainer, currentMessages]) => {
      if (currentContainer !== previousContainer) {
        previousContainer = currentContainer
        previousLastMessageKey = null
        didRequestInitialScroll = false
        hasUserScrollIntent = false
        isFollowingConversation = true
        isFollowingTail = currentContainer ? isNearTail(currentContainer) : true
        isPointerOrFocusOnOlderMessage = false
        isSelectionInOlderMessage = false
      }

      const lastIndex = currentMessages.length - 1
      if (!currentContainer || lastIndex < 0) {
        previousLastMessageKey = null
        didRequestInitialScroll = false
        return
      }

      const currentLastMessageKey = getKey(currentMessages[lastIndex], lastIndex)
      if (!didRequestInitialScroll) {
        didRequestInitialScroll = true
        previousLastMessageKey = currentLastMessageKey
        scrollToIndex(lastIndex, 'end')
        return
      }

      const previousKey = previousLastMessageKey
      previousLastMessageKey = currentLastMessageKey
      const isInspectingHistory = isPointerOrFocusOnOlderMessage || isSelectionInOlderMessage

      if (!isFollowingConversation || isInspectingHistory)
        return

      if (previousKey === currentLastMessageKey) {
        scrollToIndex(lastIndex, 'end')
        return
      }

      if (previousKey != null)
        scrollToIndex(lastIndex, 'end')
    },
    { flush: 'post', immediate: true },
  )

  return { onUserScroll }
}
