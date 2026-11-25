import type { MaybeRefOrGetter, ShallowRef } from 'vue'

import { useEventListener, useRafFn } from '@vueuse/core'
import { toValue } from 'vue'

/** The distance from an edge of the scroll viewport, in pixels, where a drag scrolls the list. */
const EDGE_ZONE = 32
/** The most pixels that the list scrolls in one frame at the very edge. */
const EDGE_SPEED = 14

/**
 * Selects or clears the items between two positions of a list, on top of the selection that the gesture started with.
 * The items outside the range keep their state from `base`, so a drag that comes back gives them back their state.
 *
 * @example
 * selectRange(new Set(['b']), ['a', 'b', 'c', 'd'], 0, 2, true)
 * // => Set { 'b', 'a', 'c' }
 */
export function selectRange(base: ReadonlySet<string>, ids: readonly string[], from: number, to: number, select: boolean): Set<string> {
  const next = new Set(base)
  const [start, end] = from <= to ? [from, to] : [to, from]
  for (const id of ids.slice(Math.max(0, start), end + 1)) {
    if (select)
      next.add(id)
    else
      next.delete(id)
  }
  return next
}

interface DragSelectionOptions {
  /** The element that holds the items. Each item carries `data-session-key` with its id. */
  container: MaybeRefOrGetter<HTMLElement | null | undefined>
  /** The element that scrolls the items, for the automatic scroll near its edges. */
  viewport: MaybeRefOrGetter<HTMLElement | null | undefined>
  /** The gestures work only while this is true, for example in selection mode. */
  enabled: MaybeRefOrGetter<boolean>
  /** The ids of the items in their visible order. */
  ids: MaybeRefOrGetter<readonly string[]>
  selected: ShallowRef<Set<string>>
}

/**
 * Mouse and pen gestures that select many items of a list at once.
 *
 * - Press on an item and drag over others: they all take the opposite of the state of the first item.
 * - Shift and a click: the items between the last clicked item and this one are selected.
 *
 * A finger drag stays a scroll. A press without a drag stays a click, which the item handles itself. After a drag or a
 * Shift click, `consumeClick` tells the item to skip the click that the browser still sends.
 */
export function useDragSelection(options: DragSelectionOptions) {
  // State of one gesture. The anchor is the item under the press, and `base` is the selection before the press.
  let anchor: number | undefined
  let base = new Set<string>()
  let select = true
  let dragging = false
  let pointerY = 0
  let pointerX = 0
  // The last item that a click or a drag started on, for Shift and a click.
  let lastAnchor: number | undefined
  let skipClick = false

  function indexAt(x: number, y: number) {
    const container = toValue(options.container)
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-session-key]')
    if (!container || !element || !container.contains(element))
      return undefined
    const index = toValue(options.ids).indexOf(element.dataset.sessionKey ?? '')
    return index >= 0 ? index : undefined
  }

  function applyAt(x: number, y: number) {
    if (anchor === undefined)
      return
    const index = indexAt(x, y)
    if (index === undefined || (!dragging && index === anchor))
      return
    dragging = true
    options.selected.value = selectRange(base, toValue(options.ids), anchor, index, select)
  }

  // While a drag is near an edge of the viewport, the list scrolls, and the item under the still pointer changes.
  const autoScroll = useRafFn(() => {
    const viewport = toValue(options.viewport)
    if (!viewport || !dragging)
      return
    const bounds = viewport.getBoundingClientRect()
    const step = pointerY < bounds.top + EDGE_ZONE
      ? -Math.ceil(EDGE_SPEED * (1 - Math.max(0, pointerY - bounds.top) / EDGE_ZONE))
      : pointerY > bounds.bottom - EDGE_ZONE
        ? Math.ceil(EDGE_SPEED * (1 - Math.max(0, bounds.bottom - pointerY) / EDGE_ZONE))
        : 0
    if (step === 0)
      return
    viewport.scrollTop += step
    // The pointer can sit outside the viewport. Read the item at the nearest point inside it.
    applyAt(pointerX, Math.min(Math.max(pointerY, bounds.top + 1), bounds.bottom - 1))
  }, { immediate: false })

  function endGesture() {
    if (dragging) {
      skipClick = true
      // The click of this press arrives before the next task. A press that never sends one must not skip a later click.
      setTimeout(() => {
        skipClick = false
      }, 0)
    }
    if (anchor !== undefined)
      lastAnchor = anchor
    anchor = undefined
    dragging = false
    autoScroll.pause()
  }

  useEventListener(() => toValue(options.container), 'pointerdown', (event: PointerEvent) => {
    if (!toValue(options.enabled) || event.button !== 0 || event.pointerType === 'touch')
      return
    const index = indexAt(event.clientX, event.clientY)
    if (index === undefined)
      return
    const ids = toValue(options.ids)
    if (event.shiftKey && lastAnchor !== undefined && lastAnchor < ids.length) {
      // A Shift click selects the whole range, so it extends a selection and never clears part of it.
      options.selected.value = selectRange(options.selected.value, ids, lastAnchor, index, true)
      skipClick = true
      setTimeout(() => {
        skipClick = false
      }, 0)
      event.preventDefault()
      return
    }
    anchor = index
    base = new Set(options.selected.value)
    select = !base.has(ids[index])
    pointerX = event.clientX
    pointerY = event.clientY
    autoScroll.resume()
  })

  useEventListener(window, 'pointermove', (event: PointerEvent) => {
    if (anchor === undefined)
      return
    pointerX = event.clientX
    pointerY = event.clientY
    applyAt(event.clientX, event.clientY)
    // A drag selects. It must not also select the text of the rows.
    if (dragging)
      event.preventDefault()
  })
  useEventListener(window, ['pointerup', 'pointercancel'], endGesture)

  /** Tells an item whether to skip its click, because a drag or a Shift click already changed the selection. */
  function consumeClick() {
    if (!skipClick)
      return false
    skipClick = false
    return true
  }

  /** Records the item of a plain click, so a following Shift click starts there. */
  function noteClick(id: string) {
    const index = toValue(options.ids).indexOf(id)
    lastAnchor = index >= 0 ? index : undefined
  }

  return { consumeClick, noteClick }
}
