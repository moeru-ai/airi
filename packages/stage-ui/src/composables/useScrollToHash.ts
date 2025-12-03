import type { Ref } from 'vue'

import { onBeforeUnmount, unref, watch } from 'vue'

export interface UseScrollToHashOptions {
  /**
   * Distance (in px) between the target element and the top of the viewport.
   */
  offset?: number
  /**
   * Smooth scroll animation.
   */
  behavior?: ScrollBehavior
  /**
   * Number of times to retry if element is not yet found.
   */
  maxRetries?: number
  /**
   * Delay (ms) between retries.
   */
  retryDelay?: number
  /**
   * Custom scroll container — defaults to `window`.
   */
  scrollContainer?: HTMLElement | string | null
  /**
   * Whether to auto-scroll when `hashRef` changes.
   */
  auto?: boolean
}

/**
 * A cross-platform composable for smooth scrolling to hash anchors.
 *
 * You can use it with or without Vue Router.
 *
 * Example:
 * ```ts
 * const { scrollToHash } = useScrollToHash({ offset: 16 })
 * scrollToHash('#chat')
 * ```
 *
 * Or:
 * ```ts
 * const route = useRoute()
 * useScrollToHash(() => route.hash, { auto: true })
 * ```
 *
 * Notes:
 * - Automatically retries if the target element isn’t found yet.
 * - Automatically cancels previous retry loops when a new scroll starts.
 * - `onMounted` is not needed since `{ immediate: true }` on the watcher handles the initial scroll.
 */
export function useScrollToHash(
  hashRef?: Ref<string | undefined> | (() => string | undefined),
  options: UseScrollToHashOptions = {},
) {
  const {
    offset = 16,
    behavior = 'smooth',
    maxRetries = 10,
    retryDelay = 100,
    scrollContainer = null,
    auto = false,
  } = options

  let retryTimer: number | undefined

  const getScrollContainer = (): Window | HTMLElement => {
    if (!scrollContainer)
      return window
    if (typeof scrollContainer === 'string') {
      const el = document.querySelector(scrollContainer)
      return el instanceof HTMLElement ? el : window
    }
    return scrollContainer
  }

  const scrollToHash = (hash?: string, attempt = 0) => {
    if (!hash)
      return

    // Cancel any existing retry loop
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = undefined
    }

    requestAnimationFrame(() => {
      const el = hash.length > 1 ? document.getElementById(hash.slice(1)) : null
      if (el) {
        const container = getScrollContainer()

        if (container instanceof Window) {
          const top = el.getBoundingClientRect().top + window.scrollY - offset
          window.scrollTo({ top, behavior })
        }
        else {
          const containerRect = container.getBoundingClientRect()
          const elRect = el.getBoundingClientRect()
          const scrollTop = elRect.top - containerRect.top + container.scrollTop - offset
          container.scrollTo({ top: scrollTop, behavior })
        }
        return
      }

      // Retry if element not yet found
      if (attempt < maxRetries) {
        retryTimer = window.setTimeout(() => scrollToHash(hash, attempt + 1), retryDelay)
      }
    })
  }

  if (auto && hashRef) {
    watch(
      () => (typeof hashRef === 'function' ? hashRef() : unref(hashRef)),
      (newHash) => {
        if (newHash)
          scrollToHash(newHash)
      },
      { immediate: true },
    )
  }

  onBeforeUnmount(() => {
    if (retryTimer)
      clearTimeout(retryTimer)
  })

  return { scrollToHash }
}
