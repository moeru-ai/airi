import type { MaybeRefOrGetter, Ref } from 'vue'

import { defaultDocument, useElementSize, usePreferredReducedMotion, useResizeObserver, useScreenSafeArea } from '@vueuse/core'
import { computed, nextTick, onMounted, onScopeDispose, shallowRef, toValue, watch } from 'vue'

import { useAdaptiveInput } from './use-adaptive-input'

/** The AIRI elements and feature policy used to lay out the mobile chat surface. */
export interface UseMobileInteractiveAreaLayoutOptions {
  /** The region that contains the message composer and its related controls. */
  area: Readonly<Ref<HTMLElement | null>>
  /** The scrollable controls beside the message composer. */
  controlsIsland: Readonly<Ref<HTMLElement | null>>
  /** The content used to detect whether the controls island overflows. */
  controlsIslandContent: Readonly<Ref<HTMLElement | null>>
  /**
   * Enables keyboard-aware layout policy.
   *
   * @default true
   */
  enabled?: MaybeRefOrGetter<boolean>
  /** The message composer used to reserve controls-island space. */
  messageComposer: Readonly<Ref<HTMLElement | null>>
  /** The mobile chat surface whose height follows the available viewport. */
  viewport: Readonly<Ref<HTMLElement | null>>
}

/**
 * Applies AIRI's mobile chat proportions and transition policy to adaptive input values.
 *
 * This composable owns only AIRI presentation decisions. Browser keyboard measurement remains
 * in {@link useAdaptiveInput}, so another framework or layout can consume the same geometry.
 */
export function useMobileInteractiveAreaLayout(options: UseMobileInteractiveAreaLayoutOptions) {
  const enabled = computed(() => options.enabled === undefined || toValue(options.enabled))
  const preferredMotion = usePreferredReducedMotion()
  const controlsIslandNaturalHeight = shallowRef<number>()
  const controlsIslandOverflowing = shallowRef(false)
  const { height: messageComposerHeight } = useElementSize(options.messageComposer, undefined, { box: 'border-box' })
  const {
    keyboardVisible,
    visibleHeight,
    viewportBottom,
    viewportOffsetTop,
  } = useAdaptiveInput({
    area: options.area,
    enabled,
    viewport: options.viewport,
  })

  const screenSafeArea = useScreenSafeArea()
  useResizeObserver(defaultDocument?.documentElement, () => screenSafeArea.update())
  onMounted(() => screenSafeArea.update())

  const viewportStyle = computed(() => enabled.value
    ? { height: `${viewportBottom.value}px` }
    : undefined)
  const chatHistoryStyle = computed(() => enabled.value
    ? { maxHeight: `${visibleHeight.value * 0.35}px` }
    : undefined)
  const controlsIslandMaxHeight = computed(() => {
    const availableHeight = Math.max(visibleHeight.value - messageComposerHeight.value, 0)
    if (!enabled.value || !keyboardVisible.value)
      return availableHeight

    return Math.min(availableHeight, visibleHeight.value * 0.45)
  })
  const controlsIslandHeight = computed(() => controlsIslandNaturalHeight.value === undefined
    ? undefined
    : Math.min(controlsIslandNaturalHeight.value, controlsIslandMaxHeight.value))
  const controlsIslandStyle = computed(() => controlsIslandHeight.value === undefined
    ? undefined
    : { height: `${controlsIslandHeight.value}px` })
  const messageComposerStyle = computed(() => ({
    paddingBottom: `${enabled.value && keyboardVisible.value
      ? 12
      : Math.max(Number.parseFloat(screenSafeArea.bottom.value.replace('px', '')), 12)}px`,
  }))

  let areaAnimation: Animation | undefined
  watch(keyboardVisible, async (_, __, onCleanup) => {
    const target = options.area.value
    if (!target || preferredMotion.value === 'reduce')
      return

    areaAnimation?.cancel()
    const previousTop = target.getBoundingClientRect().top
    let canceled = false
    onCleanup(() => {
      canceled = true
    })

    await nextTick()
    if (canceled || target !== options.area.value)
      return

    const offset = previousTop - target.getBoundingClientRect().top
    if (Math.abs(offset) < 1)
      return

    // WORKAROUND:
    // NOTICE:
    // Why: A CSS height transition leaves the input at its old position during Safari's focus check.
    // Root cause: The keyboard workaround must apply the new layout before it calls focus().
    // Code context: AdaptiveInput updates the viewport element synchronously before focus.
    // Removal condition: Safari provides keyboard geometry before it applies the focus scroll.
    areaAnimation = target.animate([
      { transform: `translate3d(0, ${offset}px, 0)` },
      { transform: 'translate3d(0, 0, 0)' },
    ], {
      duration: 250,
      easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
    })
  }, { flush: 'sync' })

  function measureControlsIslandOverflow() {
    const island = options.controlsIsland.value
    if (!island) {
      controlsIslandNaturalHeight.value = undefined
      controlsIslandOverflowing.value = false
      return
    }

    controlsIslandNaturalHeight.value = island.scrollHeight
    controlsIslandOverflowing.value = island.scrollHeight > island.clientHeight + 1
  }

  useResizeObserver([options.controlsIsland, options.controlsIslandContent], measureControlsIslandOverflow)
  watch(controlsIslandHeight, measureControlsIslandOverflow, { flush: 'post' })
  onScopeDispose(() => areaAnimation?.cancel())

  return {
    chatHistoryStyle,
    controlsIslandOverflowing,
    controlsIslandStyle,
    keyboardVisible,
    messageComposerStyle,
    viewportOffsetTop,
    viewportStyle,
  }
}
