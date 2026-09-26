import type { MaybeRefOrGetter } from 'vue'

import { electron } from '@proj-airi/electron-eventa'
import { useElectronEventaInvoke, useElectronMouse, useElectronRelativeMouse } from '@proj-airi/electron-vueuse'
import { useEventListener, useMutationObserver } from '@vueuse/core'
import { parse } from 'culori'
import { nextTick, shallowRef, toValue, watch } from 'vue'

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
 * How far, in screen pixels, a hand may shake while the window keeps the
 * pointer over a spot it no longer paints. A scroll moves the gap between two
 * bubbles under a still hand, and the wheel must keep scrolling the chat.
 */
const handJitter = 8

/**
 * An open dialog or menu, by its ARIA role. It takes the whole window, so an
 * outside click reaches it and closes it instead of passing to the app below.
 */
const openOverlaySelector = '[role="dialog"], [role="alertdialog"], [role="menu"]'

/**
 * Closes the open dialogs and menus of the page.
 *
 * They close only on events inside this page, such as an outside click. A
 * fold happens in another window, and the folded window keeps its page, so
 * an open menu would stay on screen during the fold and come back with the
 * next unfold. Every reka layer closes on Escape, and only the topmost layer
 * takes each press, so this presses it once per open layer.
 */
export async function dismissOverlays() {
  const openLayer = `:is(${openOverlaySelector})[data-state="open"]`
  for (let presses = 0; presses < 5 && document.querySelector(openLayer); presses++) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
  }
}

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
 * - The page painted under the cursor, and the hand has not pressed or moved
 *   more than {@link handJitter} on the screen since.
 *
 * The main process creates the window click-through. The cursor position comes
 * from the main process, not from DOM events, because a click-through window
 * receives no mouse events on Linux. Each position is hit-tested against the
 * document, which also answers while the window is click-through.
 *
 * The page can also change under a cursor that stays still. A dialog or menu
 * that opens or closes runs the hit test again, and so does the returned
 * `hitTest`, which the page calls once the chat has unfolded.
 */
export function useChatFloatingClickThrough(options: {
  /** Whether the chat window stays above other windows. */
  pinned: MaybeRefOrGetter<boolean>
}) {
  const { x, y } = useElectronRelativeMouse()
  // An attached window moves with the main window, so only the screen
  // position tells whether the hand moved.
  const hand = useElectronMouse()
  const setIgnoreMouseEvents = useElectronEventaInvoke(electron.window.setIgnoreMouseEvents)

  /** Screen position of the hand when the cursor last found paint; a press clears it. */
  let paintedAt: { x: number, y: number } | undefined

  // A press only reaches the page while the window takes the pointer, so the
  // hold starts over something painted and ends wherever the pointer is let go.
  const pointerHeld = shallowRef(false)
  useEventListener(window, 'pointerdown', () => {
    pointerHeld.value = true
    paintedAt = undefined
  }, { capture: true })
  useEventListener(window, 'pointerup', () => pointerHeld.value = false, { capture: true })
  useEventListener(window, 'pointercancel', () => pointerHeld.value = false, { capture: true })
  useEventListener(window, 'blur', () => pointerHeld.value = false)

  function takesPointer() {
    if (!toValue(options.pinned) || pointerHeld.value)
      return true

    if (document.querySelector(openOverlaySelector))
      return true

    const target = document.elementFromPoint(x.value, y.value)
    if (target && isPaintedAt(target)) {
      paintedAt = { x: hand.x.value, y: hand.y.value }
      return true
    }

    if (paintedAt && Math.hypot(hand.x.value - paintedAt.x, hand.y.value - paintedAt.y) <= handJitter)
      return true

    paintedAt = undefined
    return false
  }

  // `undefined` until the first hit test, so a reloaded renderer does not
  // inherit the previous page's state.
  let appliedTakesPointer: boolean | undefined
  function hitTest() {
    const next = takesPointer()
    if (next === appliedTakesPointer)
      return
    appliedTakesPointer = next
    void setIgnoreMouseEvents([!next, { forward: true }])
  }

  // Dialogs and menus mount straight into the body.
  useMutationObserver(document.body, hitTest, { childList: true })
  watch([() => toValue(options.pinned), pointerHeld, x, y], hitTest, { immediate: true })

  return { hitTest }
}
