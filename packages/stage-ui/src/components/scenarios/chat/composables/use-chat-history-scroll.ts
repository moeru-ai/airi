import type { Ref } from 'vue'

import { computed, nextTick, onScopeDispose, readonly, shallowRef, watch } from 'vue'

// NOTICE: Keep a small tolerance for "near tail" detection so sub-pixel layout shifts,
// font swaps, and late content growth do not falsely disengage follow mode.
const TAIL_THRESHOLD = 24

function scheduleAfterLayoutSettles(task: () => void) {
  const requestFrame = globalThis.requestAnimationFrame?.bind(globalThis)
  if (!requestFrame) {
    queueMicrotask(task)
    return
  }

  requestFrame(() => {
    requestFrame(() => {
      task()
    })
  })
}

interface ChatHistoryScrollOptions<TMessage> {
  /**
   * The scroll container that owns the chat history viewport.
   *
   * Use this when the composable should manage scroll state for a specific
   * `<div>` or similar scrolling element. The element must be the same node
   * that receives the rendered `[data-chat-message-key]` children, because the
   * composable both measures the container and queries message elements inside it.
   *
   * In practice, pass a template ref from the chat history list component:
   *
   * ```ts
   * const chatHistoryRef = ref<HTMLDivElement>()
   *
   * useChatHistoryScroll({
   *   containerRef: chatHistoryRef,
   *   messages,
   *   getKey,
   * })
   * ```
   */
  containerRef: Ref<HTMLDivElement | undefined>
  /**
   * The ordered chat history currently rendered inside the container.
   *
   * Use this when the message list is reactive and new items or streaming updates
   * can arrive after mount. The composable compares the current tail key with the
   * previous tail key to distinguish between:
   *
   * - a genuinely new tail message
   * - more content being appended to the existing tail message
   *
   * Pass the exact list that the UI renders, including temporary or streaming
   * placeholders if those appear in the chat history surface.
   */
  messages: Ref<TMessage[]>
  /**
   * Returns the stable rendered identity for a message at a given index.
   *
   * Use this when messages have IDs, timestamps, or another stable identity that
   * matches the DOM node's `data-chat-message-key`. The composable relies on this
   * key for two behaviors:
   *
   * - detecting whether the tail changed between updates
   * - locating the newly inserted tail element to align it into view
   *
   * The returned key should be stable for the lifetime of a rendered message.
   * If the key changes while representing the same message, the composable will
   * treat that as a new tail insertion and may scroll unexpectedly.
   */
  getKey: (message: TMessage, index: number) => string | number
  /**
   * Optional policy hook for vetoing auto-scroll on new tail insertions.
   *
   * Use this when product behavior needs one more decision layer beyond the
   * composable's built-in intent tracking. For example, a caller might suppress
   * auto-scroll for a certain role, for a synthetic system row, or while a
   * separate overlay is active.
   *
   * This hook is only consulted for genuinely new tail messages. It is not used
   * for initial mount scroll or for streaming follow of the current tail.
   *
   * Return `false` to block the auto-scroll. Any other return value allows it.
   */
  shouldScroll?: (context: {
    reason: 'new-message'
    messageKey: string | number
    role?: string
    isFollowingTail: boolean
    isInspectingHistory: boolean
  }) => boolean
}

/**
 * Keeps chat history scrolling aligned with user intent instead of raw message churn.
 *
 * Design purpose:
 *
 * - Show the latest history on first mount, even if the final layout settles a bit later.
 * - Follow a live conversation while the user is still reading at the tail.
 * - Stop automatic movement once the user starts inspecting older history.
 * - Distinguish a newly inserted tail message from streaming growth of the same tail.
 * - Align newly inserted messages to their top edge so long replies start in view.
 *
 * When to use:
 *
 * Use this composable for vertically scrolling chat or timeline surfaces where the
 * latest item normally appears at the bottom and the UI should remain polite about
 * moving the viewport. It is a good fit when messages can arrive from local input,
 * remote sync, IPC, streaming generation, or any other reactive source.
 *
 * How to use:
 *
 * 1. Render the history inside a single scrolling container.
 * 2. Add `data-chat-message-key` to each rendered message wrapper.
 * 3. Pass the container ref, rendered message list, and stable key getter.
 * 4. Optionally provide `shouldScroll` if the caller needs extra veto logic.
 *
 * The composable tracks several signals of user intent, including tail proximity,
 * pointer/focus inspection of older messages, and text selection in history.
 * Automatic follow is preserved only while those signals still indicate that the
 * user wants to stay with the live edge.
 */
export function useChatHistoryScroll<TMessage extends { role?: string }>({
  containerRef,
  messages,
  getKey,
  shouldScroll,
}: ChatHistoryScrollOptions<TMessage>) {
  const isFollowingTail = shallowRef(true)
  const isFollowingConversation = shallowRef(true)
  const isInspectingOlderMessage = shallowRef(false)
  const isSelectionInspectingHistory = shallowRef(false)
  const isInspectingHistory = computed(() => !isFollowingTail.value || isInspectingOlderMessage.value || isSelectionInspectingHistory.value)
  const pendingScrollKey = shallowRef<string | number | null>(null)
  const pendingStreamingFollow = shallowRef(false)
  const previousLastMessageKey = shallowRef<string | number | null>(null)
  const stopListening = shallowRef<(() => void) | null>(null)
  const didInitialScroll = shallowRef(false)
  const isProgrammaticScroll = shallowRef(false)

  function getContainer() {
    return containerRef.value
  }

  function getLastMessageKey() {
    const lastIndex = messages.value.length - 1
    if (lastIndex < 0)
      return null

    return getKey(messages.value[lastIndex], lastIndex)
  }

  /**
   * Keep chat auto-scroll tied to user intent instead of raw data churn.
   *
   * Criteria:
   * - Scroll to the bottom once on mount so the latest history is visible initially.
   * - Only auto-scroll when a genuinely new tail message is inserted.
   * - Never treat streaming growth of the current tail message like a new tail insertion;
   *   keep bottom-follow only while the user is already following the conversation.
   * - Only follow the live edge while the user is already near the tail.
   * - Stop automatic movement while the user is inspecting older messages through
   *   scrolling, pointer interaction, focus, or text selection.
   * - Scroll new messages to their top edge so the beginning of long replies stays visible.
   *
   * This is especially important in Electron, where the chat list can be updated by
   * external synced sources and broadcast events, not just by the local input area.
   */
  function isNearTail(container: HTMLElement) {
    // A small threshold keeps "follow live edge" stable when layout and content height shift slightly.
    return container.scrollTop + container.clientHeight >= container.scrollHeight - TAIL_THRESHOLD
  }

  function updateFollowingTail() {
    const container = getContainer()
    if (!container) {
      isFollowingTail.value = true
      return
    }

    isFollowingTail.value = isNearTail(container)
  }

  function disengageConversationFollow() {
    isFollowingConversation.value = false
  }

  function syncConversationFollowFromTail() {
    if (isFollowingTail.value)
      isFollowingConversation.value = true
  }

  function findMessageElement(target: EventTarget | Node | null) {
    if (!(target instanceof Node))
      return null

    const container = getContainer()
    if (!container)
      return null

    const element = target instanceof Element ? target : target.parentElement
    if (!element)
      return null

    return element.closest<HTMLElement>('[data-chat-message-key]')
  }

  function isLastMessageElement(element: HTMLElement | null) {
    return element?.dataset.chatMessageKey === `${getLastMessageKey() ?? ''}`
  }

  function syncPointerOrFocusInspection(target: EventTarget | null) {
    const element = findMessageElement(target)
    isInspectingOlderMessage.value = !!element && !isLastMessageElement(element)
  }

  function syncSelectionInspection() {
    const selection = document.getSelection()
    if (!selection?.anchorNode) {
      isSelectionInspectingHistory.value = false
      return
    }

    const element = findMessageElement(selection.anchorNode)
    isSelectionInspectingHistory.value = !!element && !isLastMessageElement(element)
  }

  function scrollToBottom() {
    const container = getContainer()
    if (!container)
      return

    isProgrammaticScroll.value = true
    container.scrollTo({ top: container.scrollHeight })
    nextTick(() => {
      isProgrammaticScroll.value = false
      updateFollowingTail()
      syncConversationFollowFromTail()
    })
  }

  function findMessageElementByKey(key: string | number) {
    const container = getContainer()
    if (!container)
      return null

    const messageElements = Array.from(container.querySelectorAll<HTMLElement>('[data-chat-message-key]'))
    for (const element of messageElements) {
      if (element.dataset.chatMessageKey === `${key}`)
        return element
    }

    return null
  }

  function bindContainer(container: HTMLDivElement) {
    const handleScroll = () => {
      updateFollowingTail()
      if (!isFollowingTail.value && !isProgrammaticScroll.value)
        disengageConversationFollow()
      else
        syncConversationFollowFromTail()

      if (isFollowingTail.value && !isSelectionInspectingHistory.value)
        isInspectingOlderMessage.value = false
    }

    const handlePointerOver = (event: Event) => {
      syncPointerOrFocusInspection(event.target)
    }

    const handlePointerOut = (event: Event) => {
      const relatedTarget = event instanceof PointerEvent ? event.relatedTarget : null
      syncPointerOrFocusInspection(relatedTarget)
    }

    const handleFocusIn = (event: FocusEvent) => {
      syncPointerOrFocusInspection(event.target)
    }

    const handleFocusOut = (event: FocusEvent) => {
      syncPointerOrFocusInspection(event.relatedTarget)
    }

    const handleSelectionChange = () => {
      syncSelectionInspection()
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    container.addEventListener('pointerover', handlePointerOver)
    container.addEventListener('pointerout', handlePointerOut)
    container.addEventListener('focusin', handleFocusIn)
    container.addEventListener('focusout', handleFocusOut)
    document.addEventListener('selectionchange', handleSelectionChange)

    stopListening.value = () => {
      container.removeEventListener('scroll', handleScroll)
      container.removeEventListener('pointerover', handlePointerOver)
      container.removeEventListener('pointerout', handlePointerOut)
      container.removeEventListener('focusin', handleFocusIn)
      container.removeEventListener('focusout', handleFocusOut)
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }

  watch(containerRef, (container) => {
    stopListening.value?.()
    stopListening.value = null

    if (!container)
      return

    bindContainer(container)
    updateFollowingTail()
    syncConversationFollowFromTail()
    syncSelectionInspection()

    if (!didInitialScroll.value) {
      didInitialScroll.value = true
      nextTick(() => {
        scheduleAfterLayoutSettles(() => {
          scrollToBottom()
        })
      })
    }
  }, { immediate: true })

  watch(messages, (currentMessages) => {
    const currentLastIndex = currentMessages.length - 1
    if (currentLastIndex < 0) {
      previousLastMessageKey.value = null
      pendingScrollKey.value = null
      isInspectingOlderMessage.value = false
      isSelectionInspectingHistory.value = false
      return
    }

    const currentLastMessage = currentMessages[currentLastIndex]
    const currentLastKey = getKey(currentLastMessage, currentLastIndex)
    const previousTailKey = previousLastMessageKey.value
    previousLastMessageKey.value = currentLastKey

    // The last key change is the boundary between "a new message arrived" and "the current tail
    // is still streaming more content". Only the first case is allowed to move the viewport.
    if (previousTailKey == null) {
      pendingScrollKey.value = null
      pendingStreamingFollow.value = false
      return
    }

    if (previousTailKey === currentLastKey) {
      pendingScrollKey.value = null
      if (!isFollowingConversation.value || isInspectingOlderMessage.value || isSelectionInspectingHistory.value) {
        pendingStreamingFollow.value = false
        return
      }

      pendingStreamingFollow.value = true
      return
    }

    if (!isFollowingConversation.value || isInspectingOlderMessage.value || isSelectionInspectingHistory.value) {
      pendingScrollKey.value = null
      pendingStreamingFollow.value = false
      return
    }

    const shouldScrollResult = shouldScroll?.({
      reason: 'new-message',
      messageKey: currentLastKey,
      role: currentLastMessage.role,
      isFollowingTail: isFollowingConversation.value,
      isInspectingHistory: isInspectingOlderMessage.value || isSelectionInspectingHistory.value,
    })
    if (shouldScrollResult === false) {
      pendingScrollKey.value = null
      pendingStreamingFollow.value = false
      return
    }

    pendingScrollKey.value = currentLastKey
    pendingStreamingFollow.value = false
  }, { deep: false, immediate: true })

  watch(pendingScrollKey, async (messageKey) => {
    if (messageKey == null)
      return

    await nextTick()

    const target = findMessageElementByKey(messageKey)
    pendingScrollKey.value = null
    if (!target)
      return

    // Align to the top of the new message so the start of a long reply remains visible.
    isProgrammaticScroll.value = true
    target.scrollIntoView({ block: 'start' })
    nextTick(() => {
      isProgrammaticScroll.value = false
      isFollowingConversation.value = true
      updateFollowingTail()
    })
  }, { flush: 'post' })

  watch(pendingStreamingFollow, async (shouldFollow) => {
    if (!shouldFollow)
      return

    await nextTick()
    pendingStreamingFollow.value = false
    scrollToBottom()
  }, { flush: 'post' })

  onScopeDispose(() => {
    stopListening.value?.()
  })

  return {
    isFollowingTail: readonly(isFollowingTail),
    isInspectingHistory: readonly(isInspectingHistory),
    scrollToBottom,
  }
}
