import { watch, onMounted, onBeforeUnmount, Ref, unref } from 'vue'

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
 * Example:
 *   const { scrollToHash } = useScrollToHash({ offset: 16 })
 *   scrollToHash('#chat')
 *
 * Or:
 *   const route = useRoute()
 *   useScrollToHash({ hashRef: () => route.hash, auto: true })
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

  const getScrollContainer = (): HTMLElement | Window => {
    if (!scrollContainer) return window
    if (typeof scrollContainer === 'string') {
      return document.querySelector(scrollContainer) || window
    }
    return scrollContainer
  }

  const scrollToHash = (hash?: string, attempt = 0) => {
    if (!hash) return
    requestAnimationFrame(() => {
      const el = document.querySelector(hash)
      if (el) {
        const container = getScrollContainer()

        if (container === window) {
          const top = el.getBoundingClientRect().top + window.scrollY - offset
          window.scrollTo({ top, behavior })
        } else {
          const containerEl = container as HTMLElement
          const containerRect = containerEl.getBoundingClientRect()
          const elRect = el.getBoundingClientRect()
          const scrollTop = elRect.top - containerRect.top + containerEl.scrollTop - offset
          containerEl.scrollTo({ top: scrollTop, behavior })
        }
        return
      }

      if (attempt < maxRetries) {
        retryTimer = window.setTimeout(() => scrollToHash(hash, attempt + 1), retryDelay)
      }
    })
  }

  if (auto && hashRef) {
    watch(
      () => (typeof hashRef === 'function' ? hashRef() : unref(hashRef)),
      (newHash) => {
        if (newHash) scrollToHash(newHash)
      },
      { immediate: true },
    )
  }

  onMounted(() => {
    if (auto && hashRef) {
      const currentHash = typeof hashRef === 'function' ? hashRef() : unref(hashRef)
      if (currentHash) scrollToHash(currentHash)
    }
  })

  onBeforeUnmount(() => {
    if (retryTimer) clearTimeout(retryTimer)
  })

  return { scrollToHash }
}
