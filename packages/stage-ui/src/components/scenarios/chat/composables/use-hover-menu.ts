import { useTimeoutFn } from '@vueuse/core'
import { shallowRef } from 'vue'

export interface UseHoverMenuOptions {
  /**
   * Hovering the trigger this long opens the menu. A shorter pass over the trigger does nothing.
   * @default 600
   */
  openDelayMs?: number
  /**
   * The menu closes after the pointer leaves the trigger and the menu for this long.
   * @default 300
   */
  closeDelayMs?: number
  /** Returns false while the menu must stay closed, for example while a recording runs. */
  enabled?: () => boolean
}

/**
 * Opens a menu on a trigger that keeps its own click, such as a send or record button.
 *
 * The trigger and the menu content both report pointer enter and leave. The menu opens after a hover delay, or at once
 * through `openNow` for a right-click or a key. It closes shortly after the pointer leaves both.
 *
 * Use when:
 * - A composer button acts on click and offers its settings on hover
 */
export function useHoverMenu(options: UseHoverMenuOptions = {}) {
  const open = shallowRef(false)
  const enabled = options.enabled ?? (() => true)
  const opening = useTimeoutFn(() => {
    if (enabled())
      open.value = true
  }, options.openDelayMs ?? 600, { immediate: false })
  const closing = useTimeoutFn(() => open.value = false, options.closeDelayMs ?? 300, { immediate: false })

  function enter() {
    closing.stop()
    if (!open.value)
      opening.start()
  }

  function leave() {
    opening.stop()
    if (open.value)
      closing.start()
  }

  function openNow() {
    opening.stop()
    if (enabled())
      open.value = true
  }

  function close() {
    opening.stop()
    closing.stop()
    open.value = false
  }

  return {
    open,
    /** Bind to pointerenter of the trigger and of the menu content. */
    enter,
    /** Bind to pointerleave of the trigger and of the menu content. */
    leave,
    openNow,
    close,
  }
}
