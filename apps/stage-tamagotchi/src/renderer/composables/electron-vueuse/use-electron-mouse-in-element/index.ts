import type { MaybeElementRef, MouseInElementOptions } from '@vueuse/core'

import { defaultWindow, tryOnMounted, unrefElement, useEventListener, useMutationObserver, useResizeObserver } from '@vueuse/core'
import { shallowRef, watch } from 'vue'

import { useElectronRelativeMouse } from '../use-electron-relative-mouse'

/**
 * Reactive mouse position related to an element.
 *
 * @see https://vueuse.org/useMouseInElement
 * @param target
 * @param options
 */
export function useElectronMouseInElement(
  target?: MaybeElementRef,
  options: MouseInElementOptions = {},
) {
  const {
    windowResize = true,
    windowScroll = true,
    handleOutside = true,
    window = defaultWindow,
  } = options
  const type = options.type || 'page'

  const { x, y, sourceType } = useElectronRelativeMouse(options)

  const targetRef = shallowRef(target ?? window?.document.body)
  const elementX = shallowRef(0)
  const elementY = shallowRef(0)
  const elementPositionX = shallowRef(0)
  const elementPositionY = shallowRef(0)
  const elementHeight = shallowRef(0)
  const elementWidth = shallowRef(0)
  const isOutside = shallowRef(true)

  function update() {
    if (!window)
      return

    const el = unrefElement(targetRef)
    if (!el || !(el instanceof Element))
      return

    const {
      left,
      top,
      width,
      height,
    } = el.getBoundingClientRect()

    elementPositionX.value = left + (type === 'page' ? window.pageXOffset : 0)
    elementPositionY.value = top + (type === 'page' ? window.pageYOffset : 0)
    elementHeight.value = height
    elementWidth.value = width

    const elX = x.value - elementPositionX.value
    const elY = y.value - elementPositionY.value
    isOutside.value = width === 0 || height === 0
      || elX < 0 || elY < 0
      || elX > width || elY > height

    if (handleOutside || !isOutside.value) {
      elementX.value = elX
      elementY.value = elY
    }
  }

  const stopFnList: Array<() => void> = []
  function stop() {
    stopFnList.forEach(fn => fn())
    stopFnList.length = 0
  }

  tryOnMounted(() => {
    update()
  })

  if (window) {
    const {
      stop: stopResizeObserver,
    } = useResizeObserver(targetRef, update)
    const {
      stop: stopMutationObserver,
    } = useMutationObserver(targetRef, update, {
      attributeFilter: ['style', 'class'],
    })

    const stopWatch = watch(
      [targetRef, x, y],
      update,
    )

    stopFnList.push(
      stopResizeObserver,
      stopMutationObserver,
      stopWatch,
    )

    useEventListener(
      document,
      'mouseleave',
      () => isOutside.value = true,
      { passive: true },
    )

    if (windowScroll) {
      stopFnList.push(
        useEventListener('scroll', update, { capture: true, passive: true }),
      )
    }
    if (windowResize) {
      stopFnList.push(
        useEventListener('resize', update, { passive: true }),
      )
    }
  }

  return {
    x,
    y,
    sourceType,
    elementX,
    elementY,
    elementPositionX,
    elementPositionY,
    elementHeight,
    elementWidth,
    isOutside,
    stop,
  }
}

export type UseMouseInElementReturn = ReturnType<typeof useElectronMouseInElement>
