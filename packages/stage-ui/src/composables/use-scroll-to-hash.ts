import type { Ref } from 'vue'

import { onBeforeUnmount, unref, watch } from 'vue'

export interface UseScrollToHashOptions {
  /**
   * Whether to auto-scroll when `hashRef` changes.
   */
  auto?: boolean
  /**
   * Smooth scroll animation.
   */
  behavior?: ScrollBehavior
  /**
   * Number of times to retry if element is not yet found.
   */
  maxRetries?: number
  /**
   * Distance (in px) between the target element and the top of the viewport.
   */
  offset?: number
  /**
   * Delay (ms) between retries.
   */
  retryDelay?: number
  /**
   * Custom scroll container — defaults to `window`.
   */
  scrollContainer?: HTMLElement | null | string
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
  hashRef?: (() => string | undefined) | Ref<string | undefined>,
  options: UseScrollToHashOptions = {},
) {
  const {
    auto = false,
    behavior = 'smooth',
    maxRetries = 10,
    offset = 16,
    retryDelay = 100,
    scrollContainer = null,
  } = options

  let retryTimer: number | undefined

  const getScrollContainer = (): HTMLElement | Window => {
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
          window.scrollTo({ behavior, top })
        }
        else {
          const containerRect = container.getBoundingClientRect()
          const elRect = el.getBoundingClientRect()
          const scrollTop = elRect.top - containerRect.top + container.scrollTop - offset
          container.scrollTo({ behavior, top: scrollTop })
        }
        return
      }

      // Retry if element not yet found
      if (attempt < maxRetries) {
        retryTimer = window.setTimeout(scrollToHash, retryDelay, hash, attempt + 1)
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
