import type { MaybeRefOrGetter } from 'vue'

import { useHostPointerPassthrough, useHostRelativeMouse } from '@proj-airi/stage-host-context'
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
 *
 * `fadingRoot` is left out of the opacity check, so content that this root
 * fades out still counts as painted.
 */
function isPaintedAt(target: Element, fadingRoot?: Element) {
  let painted = false
  for (let element: Element | null = target; element; element = element.parentElement) {
    const style = getComputedStyle(element)
    if ((style.opacity === '0' && element !== fadingRoot) || style.visibility === 'hidden')
      return false
    if (!painted && paintsBackground(style))
      painted = true
  }
  return painted
}

/**
 * How far, in CSS pixels, a hand may shake while the window keeps the
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
 * - The chat is not pinned above other windows, and no passive area is set.
 *   As on the main window, an unpinned window that passes a click through
 *   sinks behind the app the click activates (see
 *   `resolveFadeOnHoverInteraction`). A passive area lifts this, as Auto Hide
 *   does on the main window, because what it holds must not block the app
 *   below either way.
 * - A pointer pressed in the window is still held, so a drag of the
 *   scrollbar, a text selection or a resize keeps going off the painted area.
 * - A dialog or menu is open.
 * - The element under the cursor or one of its ancestors has
 *   `data-takes-pointer`. A resize handle along the edge paints nothing, and
 *   a press must still reach it.
 * - The page paints something under the cursor.
 * - The page painted under the cursor, and the hand has not pressed or moved
 *   more than {@link handJitter} since.
 *
 * The passive area never takes the pointer, and it is inert while it is set,
 * so keyboard focus cannot reach it either. It fades out while the cursor is
 * over something that it paints. It counts as painted while it is faded out,
 * so the fade does not end only because it hid the content.
 *
 * The cursor position comes from the host, not from DOM events, because a
 * click-through window receives no mouse events. The host reports it relative
 * to the window. A move of the window under a still hand therefore counts as a
 * hand movement, and the window then passes clicks through at once. Each
 * position is hit-tested against the document, which also answers while the
 * window is click-through.
 *
 * The page can also change under a cursor that stays still. A dialog or menu
 * that opens or closes runs the hit test again, and so does the returned
 * `hitTest`, which the page calls once the chat has unfolded, or with
 * `removed` after it removed what the cursor was over.
 */
export function useChatFloatingClickThrough(options: {
  /** Whether the chat window stays above other windows. */
  pinned: MaybeRefOrGetter<boolean>
  /** Content that takes no pointer and no keyboard focus, such as a passive message feed. */
  passiveArea?: MaybeRefOrGetter<HTMLElement | null | undefined>
}) {
  const { x, y } = useHostRelativeMouse()
  const setPointerPassthrough = useHostPointerPassthrough()

  /** Position of the cursor when it last found paint; a press clears it. */
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
  // A native move or resize of the window takes the release, so the page gets
  // no `pointerup` after it. A move without a pressed button ends the hold.
  useEventListener(window, 'pointermove', (event: PointerEvent) => {
    if (event.buttons === 0)
      pointerHeld.value = false
  }, { capture: true, passive: true })

  // NOTICE:
  // Hit testing skips inert content, so the passive area stops being inert
  // for one synchronous `elementFromPoint`. Nothing renders, focuses, or
  // dispatches in between.
  // Source: HTML `inert` hit-tests as `pointer-events: none`.
  // Removal: when a hit test can include inert content.
  function elementUnderCursor(passiveArea: HTMLElement | undefined) {
    if (!passiveArea?.inert)
      return document.elementFromPoint(x.value, y.value)

    passiveArea.inert = false
    try {
      return document.elementFromPoint(x.value, y.value)
    }
    finally {
      passiveArea.inert = true
    }
  }

  function takesPointer() {
    const passiveArea = toValue(options.passiveArea) ?? undefined
    const target = elementUnderCursor(passiveArea)
    const inPassiveArea = target !== null && passiveArea !== undefined && passiveArea.contains(target)
    if (passiveArea)
      passiveArea.style.opacity = inPassiveArea && isPaintedAt(target, passiveArea) ? '0' : ''

    if ((!toValue(options.pinned) && !passiveArea) || pointerHeld.value)
      return true

    if (document.querySelector(openOverlaySelector))
      return true

    if (target?.closest('[data-takes-pointer]'))
      return true

    if (inPassiveArea) {
      paintedAt = undefined
      return false
    }

    if (target && isPaintedAt(target)) {
      paintedAt = { x: x.value, y: y.value }
      return true
    }

    if (paintedAt && Math.hypot(x.value - paintedAt.x, y.value - paintedAt.y) <= handJitter)
      return true

    paintedAt = undefined
    return false
  }

  // `undefined` until the first hit test, so a reloaded renderer does not
  // inherit the previous page's state.
  let appliedTakesPointer: boolean | undefined
  /**
   * Runs the hit test for the current cursor.
   *
   * `removed` tells that the page removed the content under the cursor, for example a card that finished its leave
   * transition. The still-hand rule then does not apply: nothing that the hand pointed at remains, so the window
   * passes clicks through at once instead of after the next hand movement.
   */
  function hitTest(options: { removed?: boolean } = {}) {
    if (options.removed)
      paintedAt = undefined
    const next = takesPointer()
    if (next === appliedTakesPointer)
      return
    appliedTakesPointer = next
    void setPointerPassthrough(!next)
      .catch(error => console.error('[chat-floating] Failed to set the pointer passthrough:', error))
  }

  watch(() => toValue(options.passiveArea), (area, previous) => {
    if (previous) {
      previous.inert = false
      previous.style.opacity = ''
      previous.style.transition = ''
    }
    if (area) {
      area.inert = true
      area.style.transition = 'opacity 250ms ease-in-out'
    }
  }, { immediate: true })

  // Dialogs and menus mount straight into the body.
  useMutationObserver(document.body, () => hitTest(), { childList: true })
  watch([() => toValue(options.pinned), () => toValue(options.passiveArea), pointerHeld, x, y], () => hitTest(), { immediate: true })

  return { hitTest }
}
