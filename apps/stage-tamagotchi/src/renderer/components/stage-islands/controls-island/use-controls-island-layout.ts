import type { Ref } from 'vue'

import type { ControlsIslandPlacement } from './use-controls-island-placement'

import { useElementSize, useRafFn, useResizeObserver } from '@vueuse/core'
import { computed, nextTick, watch } from 'vue'

interface LayoutElements {
  main: Readonly<Ref<HTMLElement | null>>
  menu: Readonly<Ref<HTMLElement | null>>
  available: Readonly<Ref<HTMLElement | null>>
  gap: Readonly<Ref<HTMLElement | null>>
  viewport: Readonly<Ref<HTMLElement | undefined>>
  menuViewport: Readonly<Ref<HTMLElement | undefined>>
  content: Readonly<Ref<HTMLElement | null>>
}

/**
 * Owns renderer-local geometry and scroll alignment for one mounted Island.
 * Measures unconstrained border boxes, so clipping and animation cannot change
 * the direction decision. VueUse observers stop with the component scope.
 */
export function useControlsIslandLayout(elements: LayoutElements, expanded: Ref<boolean>, placement: ControlsIslandPlacement) {
  const { isLeft, isTop, dock } = placement
  const main = useElementSize(elements.main, undefined, { box: 'border-box' })
  const menu = useElementSize(elements.menu, undefined, { box: 'border-box' })
  const available = useElementSize(elements.available)
  const gap = useElementSize(elements.gap)
  const sideways = computed(() => menu.height.value > 0 && available.height.value > 0
    && main.height.value + gap.width.value + menu.height.value > available.height.value)
  const direction = computed(() => sideways.value
    ? (isLeft.value ? 'right' : 'left')
    : (isTop.value ? 'down' : 'up'))
  const scrollWholeIsland = computed(() => main.height.value > available.height.value
    || main.width.value > available.width.value
    || (sideways.value && available.width.value - main.width.value - gap.width.value <= 0))
  const panelStyle = computed(() => ({
    maxWidth: scrollWholeIsland.value ? 'none' : `${Math.max(0, available.width.value - (sideways.value ? main.width.value + gap.width.value : 0))}px`,
    maxHeight: scrollWholeIsland.value ? 'none' : `${Math.max(0, available.height.value - (sideways.value ? 0 : main.height.value + gap.width.value))}px`,
  }))
  const layoutClasses = computed(() => sideways.value
    ? [isLeft.value ? 'flex-row-reverse' : 'flex-row', isTop.value ? 'items-start' : 'items-end']
    : [isTop.value ? 'flex-col-reverse' : 'flex-col', isLeft.value ? 'items-start' : 'items-end'])
  const arrowRotation = computed(() => (({ up: 0, right: 90, down: 180, left: 270 }[direction.value]) + (expanded.value ? 180 : 0)) % 360)
  const motionOffset = computed(() => ({ up: '0, 2rem', down: '0, -2rem', left: '2rem, 0', right: '-2rem, 0' }[direction.value]))

  function alignScrollPosition() {
    const viewport = elements.viewport.value
    if (!viewport)
      return

    viewport.scrollTop = isTop.value ? 0 : viewport.scrollHeight - viewport.clientHeight
    viewport.scrollLeft = isLeft.value ? 0 : viewport.scrollWidth - viewport.clientWidth

    // Focus visibility takes precedence over docking after a layout change.
    const focused = document.activeElement
    if (focused instanceof HTMLElement && viewport.contains(focused))
      focused.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  // ScrollIntoView can change scrollbar geometry. Apply alignment after the
  // observer delivery so it cannot resize another observed box in that cycle.
  const { pause, resume } = useRafFn(() => {
    pause()
    alignScrollPosition()
  }, { immediate: false })

  // TODO: Chromium can log "ResizeObserver loop completed with undelivered notifications"
  // during rapid layout changes. The current behavior has little user impact.
  // Revisit the observer and scroll alignment scheduling when this layout changes again.
  // Observe actual geometry, never scroll offsets. User scrolling must persist.
  useResizeObserver(elements.viewport, resume)
  useResizeObserver(elements.content, resume)
  watch([dock, expanded, direction, main.width, main.height, menu.width, menu.height, available.width, available.height], async () => {
    await nextTick()
    resume()
  }, { flush: 'post' })
  watch(expanded, async (open) => {
    if (!open)
      return
    await nextTick()
    elements.menuViewport.value?.scrollTo(0, 0)
  }, { flush: 'post' })

  return { direction, scrollWholeIsland, panelStyle, layoutClasses, arrowRotation, motionOffset }
}
