import type { MaybeRefOrGetter } from 'vue'

import { useHostPointerPassthrough, useHostRelativeMouse, useHostWindowBounds } from '@proj-airi/stage-host-context'
import { useEventListener, useMutationObserver } from '@vueuse/core'
import { parse } from 'culori'
import { computed, nextTick, onScopeDispose, shallowRef, toValue, watch } from 'vue'

function paintsBackground(style: CSSStyleDeclaration) {
  if (style.backgroundImage !== 'none')
    return true

  // culori leaves `alpha` out of opaque colors.
  const color = parse(style.backgroundColor)
  return !!color && (color.alpha ?? 1) > 0
}

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

const handJitter = 8

const openOverlaySelector = '[role="dialog"], [role="alertdialog"], [role="menu"]'

export async function dismissOverlays() {
  const openLayer = `:is(${openOverlaySelector})[data-state="open"]`
  for (let presses = 0; presses < 5 && document.querySelector(openLayer); presses++) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
  }
}

export function useChatFloatingClickThrough(options: {
  pinned: MaybeRefOrGetter<boolean>
  passiveArea?: MaybeRefOrGetter<HTMLElement | null | undefined>
}) {
  const { x, y } = useHostRelativeMouse()
  // An attached window moves with the main window, so only the screen
  // position tells whether the hand moved.
  const bounds = useHostWindowBounds()
  const hand = { x: computed(() => x.value + bounds.x.value), y: computed(() => y.value + bounds.y.value) }
  const setPointerPassthrough = useHostPointerPassthrough()

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

    if (inPassiveArea) {
      paintedAt = undefined
      return false
    }

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
  function hitTest(options: { removed?: boolean } = {}) {
    if (options.removed)
      paintedAt = undefined
    const next = takesPointer()
    if (next === appliedTakesPointer)
      return
    appliedTakesPointer = next
    void setPointerPassthrough(!next).catch((error) => {
      appliedTakesPointer = undefined
      console.error('[chat-window] Failed to set native pointer passthrough:', error)
    })
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

  onScopeDispose(() => {
    const area = toValue(options.passiveArea)
    if (area) {
      area.inert = false
      area.style.opacity = ''
      area.style.transition = ''
    }
    void setPointerPassthrough(false)
  })

  return { hitTest }
}
