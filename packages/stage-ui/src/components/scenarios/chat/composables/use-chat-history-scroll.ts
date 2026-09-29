import type { Ref } from 'vue'

import { useEventListener } from '@vueuse/core'
import { computed, shallowRef, watch } from 'vue'

interface ChatHistoryScrollOptions<TMessage> {
  container: Readonly<Ref<HTMLElement | null>>
  messages: Readonly<Ref<TMessage[]>>
  getKey: (message: TMessage, index: number) => string | number
  scrollToIndex: (index: number, align: 'start' | 'end') => void
  /** Space that a floating composer covers at the end of the viewport. */
  tailInset: Readonly<Ref<number>>
  /**
   * `true` when nobody scrolls the history by hand, such as a feed that
   * passes every click through. The history returns to the tail when it
   * turns passive.
   */
  passive?: Readonly<Ref<boolean>>
}

/**
 * Keeps chat history scrolling aligned with the reader's current intent.
 *
 * A user scroll away from the tail disables automatic movement. Layout changes
 * and index scrolls do not disable it. Pointer, focus, and selection on an older
 * message also block movement until that inspection ends.
 */
export function useChatHistoryScroll<TMessage>({
  container,
  messages,
  getKey,
  scrollToIndex,
  tailInset,
  passive = shallowRef(false),
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

  useEventListener(container, ['wheel', 'touchmove'], () => {
    hasUserScrollIntent = true
  }, { passive: true })

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

  // Nobody can scroll or inspect a passive history, and an older selection
  // or pointer ends with no event that clears its flag. The history returns
  // to the tail, and the scroll listener follows it again.
  watch(passive, (isPassive) => {
    if (!isPassive)
      return

    isPointerOrFocusOnOlderMessage = false
    isSelectionInOlderMessage = false
    const lastIndex = messages.value.length - 1
    if (container.value && lastIndex >= 0)
      scrollToIndex(lastIndex, 'end')
  }, { flush: 'post' })
}
