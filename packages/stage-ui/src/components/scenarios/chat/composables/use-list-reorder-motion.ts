import type { MaybeRefOrGetter } from 'vue'

import { usePreferredReducedMotion } from '@vueuse/core'
import { computed, toValue, watch } from 'vue'

/** The timing of a move. It matches `AnimatedHeight`, so the rows and the height of the list land together. */
const MOVE_TIMING: KeyframeAnimationOptions = { duration: 300, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }

/**
 * Slides the items of a keyed list from their old places to their new places when the order of the keys changes.
 *
 * Only a change of the order starts a move, so an update of item data moves nothing. A move starts from the place where
 * the item is at that moment, also in the middle of a move. An item that leaves keeps its place while it fades:
 * bind `holdLeavingItem` to the `before-leave` event of the `TransitionGroup`.
 *
 * NOTICE:
 * Items move by the Web Animations API, not by the move classes of `TransitionGroup`.
 * A store can update the items several times right after one action. On each update, `TransitionGroup` cancels the
 * running move and does not start it again, so the item jumps to its new place.
 * Source: `onUpdated` and `callPendingCbs` of `TransitionGroup` in `@vue/runtime-dom` 3.5.
 * Removal condition: `TransitionGroup` keeps or restarts a running move across repeated updates.
 */
export function useListReorderMotion(options: {
  /** The element whose children are the items. */
  list: MaybeRefOrGetter<HTMLElement | null | undefined>
  /** The keys of the items in their order. */
  keys: MaybeRefOrGetter<readonly string[]>
  /** The key of an item element. An element without a key, for example an empty state, does not move. */
  keyOf: (item: HTMLElement) => string | undefined
  /** The class that `TransitionGroup` gives to an item while it leaves. A leaving item does not move. */
  leaveActiveClass: string
}) {
  const reducedMotion = usePreferredReducedMotion()
  const moves = new WeakMap<HTMLElement, Animation>()
  let topsBefore = new Map<string, number>()

  // The same array while the order stays, so the watchers run only for a change of the order.
  const order = computed<readonly string[]>((previous) => {
    const next = toValue(options.keys)
    return previous && previous.length === next.length && previous.every((key, index) => key === next[index]) ? previous : next
  })

  function items(list: HTMLElement) {
    return [...list.children].filter((item): item is HTMLElement =>
      item instanceof HTMLElement && options.keyOf(item) !== undefined && !item.classList.contains(options.leaveActiveClass))
  }

  watch(order, () => {
    topsBefore = new Map()
    const list = toValue(options.list)
    if (!list)
      return
    const listTop = list.getBoundingClientRect().top
    for (const item of items(list))
      topsBefore.set(options.keyOf(item)!, item.getBoundingClientRect().top - listTop)
  }, { flush: 'pre' })

  watch(order, () => {
    const list = toValue(options.list)
    if (!list || reducedMotion.value === 'reduce')
      return
    for (const item of items(list)) {
      const before = topsBefore.get(options.keyOf(item)!)
      if (before === undefined)
        continue
      // The place before includes a running move. The layout offset does not, so the new move starts where the item is.
      const offset = before - item.offsetTop
      moves.get(item)?.cancel()
      if (Math.abs(offset) < 0.5)
        continue
      moves.set(item, item.animate([{ transform: `translateY(${offset}px)` }, { transform: 'none' }], MOVE_TIMING))
    }
  }, { flush: 'post' })

  /**
   * Keeps a leaving item at its place while it fades. The item leaves the flow at once, so the items after it slide up.
   * Without a fixed top, items that leave together share the place of the first one.
   */
  function holdLeavingItem(element: Element) {
    if (element instanceof HTMLElement)
      element.style.top = `${element.offsetTop}px`
  }

  return { holdLeavingItem }
}
