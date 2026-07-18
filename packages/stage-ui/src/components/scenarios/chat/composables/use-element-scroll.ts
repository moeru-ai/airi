import type { MaybeComputedElementRef } from '@vueuse/core'

import { useElementBounding, useEventListener, useResizeObserver, useWindowSize } from '@vueuse/core'
import { clamp } from 'es-toolkit'
import { computed, onBeforeUnmount, shallowRef, toValue, watchEffect } from 'vue'

export function useElementScroll(
  element: MaybeComputedElementRef,
  scrollTarget: MaybeComputedElementRef<HTMLElement | null | undefined>,
) {
  const scrollOffset = shallowRef(0)
  const effectiveScrollTarget = shallowRef<HTMLElement | null>(null)
  const stopScrollListener = shallowRef<(() => void) | null>(null)

  const { height: windowHeight } = useWindowSize()
  const {
    top: elementTop,
    height: elementHeight,
    update: updateElementBounds,
  } = useElementBounding(element, {
    immediate: true,
    reset: false,
    windowResize: true,
    windowScroll: true,
  })

  const {
    top: scrollViewportTop,
    bottom: scrollViewportBottom,
    update: updateScrollViewportBounds,
  } = useElementBounding(scrollTarget, {
    immediate: true,
    reset: true,
    windowResize: true,
    windowScroll: true,
  })

  const resolvedScrollTarget = computed(() => toValue(scrollTarget) ?? null)

  function syncEffectiveScrollTarget() {
    const target = resolvedScrollTarget.value
    effectiveScrollTarget.value = target && target.scrollHeight > target.clientHeight
      ? target
      : null
  }

  function bindScrollTarget(target: HTMLElement | null | undefined) {
    stopScrollListener.value?.()
    stopScrollListener.value = null

    scrollOffset.value = target?.scrollTop ?? 0
    updateScrollViewportBounds()
    if (!target)
      return

    stopScrollListener.value = useEventListener(target, 'scroll', () => {
      scrollOffset.value = target.scrollTop
      updateElementBounds()
      updateScrollViewportBounds()
    }, { passive: true })
  }

  const viewportTop = computed(() => effectiveScrollTarget.value ? scrollViewportTop.value : 0)
  const viewportBottom = computed(() => effectiveScrollTarget.value ? scrollViewportBottom.value : windowHeight.value)
  const viewportHeight = computed(() => effectiveScrollTarget.value?.clientHeight ?? windowHeight.value)
  const elementTopInScrollContent = computed(() => {
    if (!effectiveScrollTarget.value)
      return elementTop.value

    return elementTop.value - scrollViewportTop.value + scrollOffset.value
  })
  const visibleStart = computed(() => {
    if (!effectiveScrollTarget.value)
      return Math.max(viewportTop.value - elementTop.value, 0)

    return clamp(scrollOffset.value - elementTopInScrollContent.value, 0, elementHeight.value)
  })
  const visibleEnd = computed(() => {
    if (!effectiveScrollTarget.value)
      return Math.min(viewportBottom.value - elementTop.value, elementHeight.value)

    return clamp(scrollOffset.value + viewportHeight.value - elementTopInScrollContent.value, 0, elementHeight.value)
  })
  const innerTop = computed(() => elementTop.value + visibleStart.value)
  const innerBottom = computed(() => elementTop.value + visibleEnd.value)
  const innerHeight = computed(() => Math.max(0, visibleEnd.value - visibleStart.value))
  const hasMeasuredElement = computed(() => elementHeight.value > 0)
  const isVisible = computed(() => hasMeasuredElement.value && innerHeight.value > 0)

  watchEffect(() => {
    syncEffectiveScrollTarget()
    bindScrollTarget(effectiveScrollTarget.value)
    updateElementBounds()
    updateScrollViewportBounds()
  })

  useResizeObserver(element, () => {
    syncEffectiveScrollTarget()
    updateElementBounds()
    updateScrollViewportBounds()
  })

  useEventListener(window, 'resize', () => {
    syncEffectiveScrollTarget()
    bindScrollTarget(effectiveScrollTarget.value)
    updateElementBounds()
    updateScrollViewportBounds()
  }, { passive: true })

  onBeforeUnmount(() => {
    stopScrollListener.value?.()
  })

  return {
    scrollOffset,

    viewportTop,
    viewportBottom,
    viewportHeight,

    elementTop,
    elementHeight,
    elementTopInScrollContent,

    visibleStart,
    visibleEnd,

    innerTop,
    innerBottom,
    innerHeight,

    hasMeasuredElement,
    isVisible,
    scrollTarget: effectiveScrollTarget,

    updateElementBounds,
    updateScrollViewportBounds,
  }
}
