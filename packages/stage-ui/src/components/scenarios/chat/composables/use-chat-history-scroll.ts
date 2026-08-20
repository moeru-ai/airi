import type { Ref } from 'vue'

import { computed, nextTick, onScopeDispose, readonly, shallowRef, watch } from 'vue'

// NOTICE: Keep a small tolerance for "near tail" detection so sub-pixel layout shifts,
// font swaps, and late content growth do not falsely disengage follow mode.
const TAIL_THRESHOLD = 24
const CHAT_MESSAGE_SURFACE_SELECTOR = '[data-chat-message-surface]'
const TOP_FADE_TRANSPARENT_STOP_PROPERTY = '--chat-top-fade-transparent-stop'
const TOP_FADE_OPAQUE_STOP_PROPERTY = '--chat-top-fade-opaque-stop'

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
   * const virtualizerRef = ref<VirtualizerHandle>()
   *
   * useChatHistoryScroll({
   *   containerRef: chatHistoryRef,
   *   messages,
   *   getKey,
   *   scrollToIndex: (index, align) => virtualizerRef.value?.scrollToIndex(index, { align }),
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
   * key to detect whether the tail changed between updates. The rendered DOM
   * also uses the key for pointer, focus, and selection intent tracking.
   *
   * The returned key should be stable for the lifetime of a rendered message.
   * If the key changes while representing the same message, the composable will
   * treat that as a new tail insertion and may scroll unexpectedly.
   */
  getKey: (message: TMessage, index: number) => string | number
  /**
   * Moves the virtualized list to one message without requiring that message to be mounted.
   *
   * The caller owns the virtualization library. This composable only chooses the target
   * index and whether the message start or end should align with the viewport.
   */
  scrollToIndex: (index: number, align: 'start' | 'end') => void
  /**
   * The share of the viewport used to fade message surfaces at the top edge.
   *
   * Set this to `0` to remove the fade. The mask is applied to each message
   * surface instead of the scroll container so its backdrop blur can still
   * sample the scene behind the chat history.
   */
  topFadeRatio?: Ref<number>
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
 * 1. Render the history inside a virtualizer with one scrolling container.
 * 2. Add `data-chat-message-key` to each rendered message wrapper.
 * 3. Pass the container ref, rendered message list, stable key getter, and index scroll callback.
 * 4. Optionally provide `shouldScroll` if the caller needs another veto rule.
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
  scrollToIndex,
  topFadeRatio,
  shouldScroll,
}: ChatHistoryScrollOptions<TMessage>) {
  const isFollowingTail = shallowRef(true)
  const isFollowingConversation = shallowRef(true)
  const isInspectingOlderMessage = shallowRef(false)
  const isSelectionInspectingHistory = shallowRef(false)
  const isInspectingHistory = computed(() => !isFollowingTail.value || isInspectingOlderMessage.value || isSelectionInspectingHistory.value)
  const pendingScrollIndex = shallowRef<number | null>(null)
  const pendingStreamingFollow = shallowRef(false)
  const previousLastMessageKey = shallowRef<string | number | null>(null)
  const stopListening = shallowRef<(() => void) | null>(null)
  const didInitialScroll = shallowRef(false)
  const isProgrammaticScroll = shallowRef(false)
  let pendingTopFadeFrame: number | undefined

  function getContainer() {
    return containerRef.value
  }

  function getLastMessageKey() {
    const lastIndex = messages.value.length - 1
    if (lastIndex < 0)
      return null

    return getKey(messages.value[lastIndex], lastIndex)
  }

  function setTopFadeStops(surface: HTMLElement, transparentStop: number, opaqueStop: number) {
    surface.style.setProperty(TOP_FADE_TRANSPARENT_STOP_PROPERTY, `${transparentStop}px`)
    surface.style.setProperty(TOP_FADE_OPAQUE_STOP_PROPERTY, `${opaqueStop}px`)
  }

  function setFullyOpaqueTopFadeStops(surface: HTMLElement) {
    setTopFadeStops(surface, -1, 0)
  }

  function updateTopFadeMasks() {
    const container = getContainer()
    if (!container)
      return

    const surfaces = container.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SURFACE_SELECTOR)
    const fadeRatio = topFadeRatio?.value ?? 0
    const fadeHeight = container.clientHeight * fadeRatio
    const containerRect = container.getBoundingClientRect()
    surfaces.forEach((surface) => {
      const surfaceRect = surface.getBoundingClientRect()
      const surfaceTop = surfaceRect.top - containerRect.top

      if (fadeHeight <= 0 || surfaceTop >= fadeHeight) {
        setFullyOpaqueTopFadeStops(surface)
        return
      }

      // NOTICE:
      // Keep the mask declaration mounted while a message crosses the scroll boundary.
      // Chromium can flash when backdrop-filter and mask layers change during a scroll frame.
      // Source: https://issues.chromium.org/issues/483220231.
      // Remove this workaround when browsers provide stable spatial blur without mask layers.
      const transparentStop = -surfaceTop
      const opaqueStop = fadeHeight - surfaceTop
      setTopFadeStops(surface, transparentStop, opaqueStop)
    })
  }

  function scheduleTopFadeUpdate() {
    if (pendingTopFadeFrame != null)
      return

    const requestFrame = globalThis.requestAnimationFrame?.bind(globalThis)
    if (!requestFrame) {
      updateTopFadeMasks()
      return
    }

    pendingTopFadeFrame = requestFrame(() => {
      pendingTopFadeFrame = undefined
      updateTopFadeMasks()
    })
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
    const lastIndex = messages.value.length - 1
    if (!container || lastIndex < 0)
      return

    isProgrammaticScroll.value = true
    scrollToIndex(lastIndex, 'end')
    nextTick(() => {
      isProgrammaticScroll.value = false
      updateFollowingTail()
      syncConversationFollowFromTail()
      scheduleTopFadeUpdate()
    })
  }

  function scheduleInitialScroll() {
    if (didInitialScroll.value || !getContainer() || messages.value.length === 0)
      return

    didInitialScroll.value = true
    nextTick(() => {
      scheduleAfterLayoutSettles(() => {
        scrollToBottom()
      })
    })
  }

  function bindContainer(container: HTMLDivElement) {
    const handleScroll = () => {
      scheduleTopFadeUpdate()
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

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(scheduleTopFadeUpdate)
    const observedMessageSurfaces = new Set<HTMLElement>()
    const syncObservedMessageSurfaces = () => {
      const currentSurfaces = new Set(
        Array.from(container.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SURFACE_SELECTOR)),
      )

      observedMessageSurfaces.forEach((surface) => {
        if (currentSurfaces.has(surface))
          return

        resizeObserver?.unobserve(surface)
        observedMessageSurfaces.delete(surface)
      })

      currentSurfaces.forEach((surface) => {
        if (observedMessageSurfaces.has(surface))
          return

        resizeObserver?.observe(surface)
        observedMessageSurfaces.add(surface)
      })
    }
    const mutationObserver = typeof MutationObserver === 'undefined'
      ? undefined
      : new MutationObserver(() => {
          syncObservedMessageSurfaces()
          scheduleTopFadeUpdate()
        })

    container.addEventListener('scroll', handleScroll, { passive: true })
    container.addEventListener('pointerover', handlePointerOver)
    container.addEventListener('pointerout', handlePointerOut)
    container.addEventListener('focusin', handleFocusIn)
    container.addEventListener('focusout', handleFocusOut)
    document.addEventListener('selectionchange', handleSelectionChange)
    resizeObserver?.observe(container)
    syncObservedMessageSurfaces()
    mutationObserver?.observe(container, { childList: true, characterData: true, subtree: true })
    scheduleTopFadeUpdate()

    stopListening.value = () => {
      container.removeEventListener('scroll', handleScroll)
      container.removeEventListener('pointerover', handlePointerOver)
      container.removeEventListener('pointerout', handlePointerOut)
      container.removeEventListener('focusin', handleFocusIn)
      container.removeEventListener('focusout', handleFocusOut)
      document.removeEventListener('selectionchange', handleSelectionChange)
      resizeObserver?.disconnect()
      observedMessageSurfaces.clear()
      mutationObserver?.disconnect()
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

    scheduleInitialScroll()
  }, { immediate: true })

  watch(messages, (currentMessages) => {
    const currentLastIndex = currentMessages.length - 1
    if (currentLastIndex < 0) {
      previousLastMessageKey.value = null
      pendingScrollIndex.value = null
      isInspectingOlderMessage.value = false
      isSelectionInspectingHistory.value = false
      return
    }

    const currentLastMessage = currentMessages[currentLastIndex]
    const currentLastKey = getKey(currentLastMessage, currentLastIndex)
    const previousTailKey = previousLastMessageKey.value
    previousLastMessageKey.value = currentLastKey
    scheduleInitialScroll()

    // The last key change is the boundary between "a new message arrived" and "the current tail
    // is still streaming more content". Only the first case is allowed to move the viewport.
    if (previousTailKey == null) {
      pendingScrollIndex.value = null
      pendingStreamingFollow.value = false
      return
    }

    if (previousTailKey === currentLastKey) {
      pendingScrollIndex.value = null
      if (!isFollowingConversation.value || isInspectingOlderMessage.value || isSelectionInspectingHistory.value) {
        pendingStreamingFollow.value = false
        return
      }

      pendingStreamingFollow.value = true
      return
    }

    if (!isFollowingConversation.value || isInspectingOlderMessage.value || isSelectionInspectingHistory.value) {
      pendingScrollIndex.value = null
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
      pendingScrollIndex.value = null
      pendingStreamingFollow.value = false
      return
    }

    pendingScrollIndex.value = currentLastIndex
    pendingStreamingFollow.value = false
  }, { deep: false, immediate: true })

  watch([messages, () => topFadeRatio?.value ?? 0], async () => {
    await nextTick()
    scheduleTopFadeUpdate()
  }, { deep: false, flush: 'post', immediate: true })

  watch(pendingScrollIndex, async (messageIndex) => {
    if (messageIndex == null)
      return

    await nextTick()

    // Align to the top of the new message so the start of a long reply remains visible.
    pendingScrollIndex.value = null
    isProgrammaticScroll.value = true
    scrollToIndex(messageIndex, 'start')
    nextTick(() => {
      isProgrammaticScroll.value = false
      isFollowingConversation.value = true
      updateFollowingTail()
      scheduleTopFadeUpdate()
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
    if (pendingTopFadeFrame != null)
      globalThis.cancelAnimationFrame?.(pendingTopFadeFrame)
  })

  return {
    isFollowingTail: readonly(isFollowingTail),
    isInspectingHistory: readonly(isInspectingHistory),
    scrollToBottom,
  }
}
