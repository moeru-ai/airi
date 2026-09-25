import type { MaybeRefOrGetter } from 'vue'

import { electron } from '@proj-airi/electron-eventa'
import { useElectronEventaInvoke, useElectronRelativeMouse } from '@proj-airi/electron-vueuse'
import { useEventListener } from '@vueuse/core'
import { parse } from 'culori'
import { computed, shallowRef, toValue, watch } from 'vue'

function paintsBackground(style: CSSStyleDeclaration) {
  if (style.backgroundImage !== 'none')
    return true

  // culori leaves `alpha` out of opaque colors.
  const color = parse(style.backgroundColor)
  return !!color && (color.alpha ?? 1) > 0
}

/**
 * Whether the page paints anything the user can see at this element.
 *
 * The window is transparent, so what the user sees is what the page paints.
 * The point counts as painted when the element or one of its ancestors draws
 * a background there, and no element in the chain hides it with zero opacity
 * or `visibility: hidden`. Text and icons sit inside such backgrounds in this
 * window; text drawn straight onto the transparent page passes clicks through
 * like the space around it.
 */
function isPaintedAt(target: Element) {
  let painted = false
  for (let element: Element | null = target; element; element = element.parentElement) {
    const style = getComputedStyle(element)
    if (style.opacity === '0' || style.visibility === 'hidden')
      return false
    if (!painted && paintsBackground(style))
      painted = true
  }
  return painted
}

/**
 * An open dialog or menu, by its ARIA role. It takes the whole window, so an
 * outside click reaches it and closes it instead of passing to the app below.
 */
const openOverlaySelector = '[role="dialog"], [role="alertdialog"], [role="menu"]'

/**
 * Keeps the transparent floating chat window click-through wherever the page
 * paints nothing, and interactive wherever the user can see something.
 *
 * The window takes the pointer when one of these holds:
 * - The chat is not pinned above other windows. As on the main window, an
 *   unpinned window that passes a click through sinks behind the app the
 *   click activates (see `resolveFadeOnHoverInteraction`).
 * - A pointer pressed in the window is still held, so a drag of the
 *   scrollbar, a text selection or a resize keeps going off the painted area.
 * - A dialog or menu is open.
 * - The page paints something under the cursor.
 *
 * The main process creates the window click-through. The cursor position comes
 * from the main process, not from DOM events, because a click-through window
 * receives no mouse events on Linux. Each position is hit-tested against the
 * document, which also answers while the window is click-through.
 */
export function useChatFloatingClickThrough(options: {
  /** Whether the chat window stays above other windows. */
  pinned: MaybeRefOrGetter<boolean>
}) {
  const { x, y } = useElectronRelativeMouse()
  const setIgnoreMouseEvents = useElectronEventaInvoke(electron.window.setIgnoreMouseEvents)

  // A press only reaches the page while the window takes the pointer, so the
  // hold starts over something painted and ends wherever the pointer is let go.
  const pointerHeld = shallowRef(false)
  useEventListener(window, 'pointerdown', () => pointerHeld.value = true, { capture: true })
  useEventListener(window, 'pointerup', () => pointerHeld.value = false, { capture: true })
  useEventListener(window, 'pointercancel', () => pointerHeld.value = false, { capture: true })
  useEventListener(window, 'blur', () => pointerHeld.value = false)

  const takesPointer = computed(() => {
    if (!toValue(options.pinned) || pointerHeld.value)
      return true

    // The cursor position is the dependency that re-runs this; an overlay that
    // opens or closes is found again on the next cursor move.
    if (document.querySelector(openOverlaySelector))
      return true

    const target = document.elementFromPoint(x.value, y.value)
    return !!target && isPaintedAt(target)
  })

  // Immediate, so a reloaded renderer does not inherit the previous page's state.
  watch(takesPointer, (value) => {
    void setIgnoreMouseEvents([!value, { forward: true }])
  }, { immediate: true })
}
