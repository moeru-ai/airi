import { useEventListener, useMutationObserver, useResizeObserver } from '@vueuse/core'
import { onScopeDispose, shallowRef, watch } from 'vue'

import { useHostPointerPassthrough, useHostRelativeMouse, useHostWindowMove } from '../host-context'

/** Keeps only the painted Inlay interactive, including while the native window passes pointer events through. */
export function useInlayPointer() {
  const { x, y } = useHostRelativeMouse()
  const setPassthrough = useHostPointerPassthrough()
  const { beginMove } = useHostWindowMove()
  const held = shallowRef(false)
  const paintedSurface = shallowRef<HTMLElement | null>(null)
  let applied: boolean | undefined
  let disposed = false
  let pending = Promise.resolve()

  function apply(passthrough: boolean) {
    if (passthrough === applied)
      return

    applied = passthrough
    // Serialize native writes so a late response cannot restore an obsolete hit-test result.
    pending = pending.then(() => setPassthrough(passthrough)).catch((error) => {
      applied = undefined
      console.error('[inlay] Failed to update pointer passthrough:', error)
    })
  }

  function hitTest() {
    if (disposed)
      return

    if (held.value || document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) {
      apply(false)
      return
    }

    const surface = document.elementFromPoint(x.value, y.value)?.closest<HTMLElement>('[data-inlay-surface]')
    const style = surface ? getComputedStyle(surface) : undefined
    apply(!style || style.opacity === '0' || style.visibility === 'hidden')
  }

  useEventListener(window, 'pointerdown', () => held.value = true, { capture: true })
  useEventListener(window, 'pointerup', () => held.value = false, { capture: true })
  useEventListener(window, 'pointercancel', () => held.value = false)
  useEventListener(window, 'blur', () => held.value = false)
  useEventListener(window, 'mousedown', (event) => {
    if (event.button !== 0 || !(event.target instanceof Element))
      return

    const target = event.target
    const dragRegion = target.closest('.drag-region')
    if (!dragRegion || target.closest('button, input, textarea, a, [contenteditable="true"], [role="button"]'))
      return

    for (let element: Element | null = target; element && element !== dragRegion; element = element.parentElement) {
      if (getComputedStyle(element).getPropertyValue('-webkit-app-region') === 'no-drag')
        return
    }

    event.preventDefault()
    beginMove().catch(error => console.error('[inlay] Failed to move the window:', error)).finally(() => {
      held.value = false
      hitTest()
    })
  })

  useMutationObserver(document.body, () => {
    paintedSurface.value = document.querySelector('[data-inlay-surface]')
    hitTest()
  }, { childList: true, subtree: true })
  // Capsule-to-card sizing can move painted content under a stationary cursor.
  useResizeObserver(paintedSurface, hitTest)
  watch([x, y, held], hitTest, { immediate: true })
  onScopeDispose(() => {
    disposed = true
    // A retained native window must not block the desktop after its page unmounts.
    apply(true)
  })

  return { hitTest }
}
