import type { ConfigurableWindow, MaybeComputedElementRef } from '@vueuse/core'
import type { MaybeRefOrGetter } from 'vue'

import type { AdaptiveInputLayout } from '../browser/adaptive-input'

import { defaultWindow, unrefElement, useEventListener, useWindowSize } from '@vueuse/core'
import { computed, readonly, shallowReactive, shallowRef, toRefs, toValue, watch } from 'vue'

import { ADAPTIVE_INPUT_LAYOUT_EVENT, AdaptiveInput } from '../browser/adaptive-input'

/** The element targets and policy consumed by {@link useAdaptiveInput}. */
export interface UseAdaptiveInputOptions extends ConfigurableWindow {
  /**
   * Enables keyboard measurement and layout updates.
   *
   * @default true
   */
  enabled?: MaybeRefOrGetter<boolean>
  /** The region that contains editable controls and moves above the keyboard. */
  area: MaybeComputedElementRef<HTMLElement | null>
  /** The region whose height follows the available viewport. */
  viewport: MaybeComputedElementRef<HTMLElement | null>
}

/**
 * Exposes reactive layout values from the framework-free {@link AdaptiveInput} controller.
 *
 * The composable owns the controller while both element targets are available. It does not move
 * unrelated visual layers. Consumers decide how to use `viewportOffsetTop`.
 */
export function useAdaptiveInput(options: UseAdaptiveInputOptions) {
  const targetWindow = options.window ?? defaultWindow
  const enabled = computed(() => options.enabled === undefined || toValue(options.enabled))
  const area = computed(() => unrefElement(options.area))
  const viewport = computed(() => unrefElement(options.viewport))
  const controller = shallowRef<AdaptiveInput>()
  const { height: layoutViewportHeight } = useWindowSize({
    includeScrollbar: false,
    initialHeight: 0,
    window: targetWindow,
  })
  const layout = shallowReactive<AdaptiveInputLayout>({
    keyboardVisible: false,
    visibleHeight: layoutViewportHeight.value,
    viewportBottom: layoutViewportHeight.value,
    viewportOffsetTop: 0,
  })

  useEventListener(controller, ADAPTIVE_INPUT_LAYOUT_EVENT, () => {
    const currentLayout = controller.value?.layout
    if (!currentLayout)
      return

    layout.keyboardVisible = currentLayout.keyboardVisible
    layout.visibleHeight = currentLayout.visibleHeight
    layout.viewportBottom = currentLayout.viewportBottom
    layout.viewportOffsetTop = currentLayout.viewportOffsetTop
  })

  watch([viewport, area, enabled], ([viewportElement, areaElement, keyboardEnabled], _, onCleanup) => {
    if (!viewportElement || !areaElement || !keyboardEnabled) {
      layout.keyboardVisible = false
      layout.visibleHeight = layoutViewportHeight.value
      layout.viewportBottom = layoutViewportHeight.value
      layout.viewportOffsetTop = 0
      return
    }

    const currentController = new AdaptiveInput({
      area: areaElement,
      viewport: viewportElement,
      window: targetWindow,
    })
    controller.value = currentController
    layout.keyboardVisible = currentController.layout.keyboardVisible
    layout.visibleHeight = currentController.layout.visibleHeight
    layout.viewportBottom = currentController.layout.viewportBottom
    layout.viewportOffsetTop = currentController.layout.viewportOffsetTop

    onCleanup(() => {
      controller.value = undefined
      currentController.dispose()
    })
  }, { flush: 'post', immediate: true })

  watch(layoutViewportHeight, (height) => {
    if (controller.value)
      return

    layout.keyboardVisible = false
    layout.visibleHeight = height
    layout.viewportBottom = height
    layout.viewportOffsetTop = 0
  }, { flush: 'sync' })

  return toRefs(readonly(layout))
}
