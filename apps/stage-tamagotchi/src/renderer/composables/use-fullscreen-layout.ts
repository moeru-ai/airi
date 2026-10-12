import type { InjectionKey } from 'vue'

import { useElementBounding, useLocalStorage, useWindowSize } from '@vueuse/core'
import { computed, inject, provide, shallowRef } from 'vue'

/** The share of the area width that the stage takes on the left. The surface takes the rest on the right. */
const STAGE_SHARE = 0.42
/** The share of the area width that the surface takes until the user drags its edge. */
const SURFACE_SHARE = 0.54
/** The narrowest surface: the width of the settings window, which settings pages are laid out for. */
const SURFACE_MIN_WIDTH = 600
/** The space between the surface and the top and right edges of the area. */
const SURFACE_MARGIN = 24

function createFullscreenLayout() {
  const { width: windowWidth } = useWindowSize()
  /** The surface width that the user chose by dragging its edge. `0` keeps the default share. */
  const surfaceWidthChoice = useLocalStorage('fullscreen/surface-width', 0)
  /** The drag of the surface edge: the pointer, where it started, and the width it gives now. */
  const surfaceDrag = shallowRef<{ pointerId: number, startX: number, startWidth: number, width: number }>()
  /** The element of the island. The overlay sets it. */
  const islandElement = shallowRef<HTMLElement>()
  const islandBounds = useElementBounding(islandElement)

  /**
   * Keeps a surface width in an area of `areaWidth` from the settings window width to the island, with the island's
   * margin left between them. A window that grows into the area still has its old size when the transition starts, so
   * the caller gives the area width.
   */
  function clampSurfaceWidth(width: number, areaWidth: number) {
    const islandRight = islandBounds.right.value
    const widest = islandRight ? areaWidth - SURFACE_MARGIN - islandRight - islandBounds.left.value : Infinity
    return Math.round(Math.min(Math.max(width, SURFACE_MIN_WIDTH), widest))
  }

  /** The surface width in an area of `areaWidth`: the dragged or chosen width, or the default share. */
  function surfaceWidthIn(areaWidth: number) {
    const chosen = surfaceDrag.value?.width ?? surfaceWidthChoice.value
    return clampSurfaceWidth(chosen || areaWidth * SURFACE_SHARE, areaWidth)
  }

  /** The character moves by half of the change of the surface width, so it stays centered in the space beside it. */
  function stageOffsetIn(areaWidth: number) {
    return (clampSurfaceWidth(areaWidth * SURFACE_SHARE, areaWidth) - surfaceWidthIn(areaWidth)) / 2
  }

  /** The size of the stage in an area. The canvas keeps this size while the surface width changes. */
  function stageSizeIn(area: { width: number, height: number }) {
    return { width: Math.round(area.width * STAGE_SHARE), height: area.height }
  }

  const surfaceWidth = computed(() => surfaceWidthIn(windowWidth.value))

  function startSurfaceDrag(event: PointerEvent) {
    if (event.currentTarget instanceof HTMLElement)
      event.currentTarget.setPointerCapture(event.pointerId)
    surfaceDrag.value = { pointerId: event.pointerId, startX: event.clientX, startWidth: surfaceWidth.value, width: surfaceWidth.value }
  }

  function moveSurfaceDrag(event: PointerEvent) {
    const drag = surfaceDrag.value
    if (drag?.pointerId !== event.pointerId)
      return
    // The surface sits on the right, so moving its left edge to the left widens it.
    surfaceDrag.value = { ...drag, width: clampSurfaceWidth(drag.startWidth + drag.startX - event.clientX, windowWidth.value) }
  }

  /** Ends a drag and keeps the width it gave, so the next fullscreen mode opens with it. */
  function endSurfaceDrag(event: PointerEvent) {
    const drag = surfaceDrag.value
    if (drag?.pointerId !== event.pointerId)
      return
    surfaceWidthChoice.value = drag.width
    surfaceDrag.value = undefined
  }

  return {
    /** The space between the surface and the top and right edges of the area. */
    surfaceMargin: SURFACE_MARGIN,
    /** The surface width in the window as it is now. */
    surfaceWidth,
    /** Whether the user drags the surface edge now. */
    surfaceDragging: computed(() => !!surfaceDrag.value),
    /** The stage offset in the window as it is now. */
    stageOffset: computed(() => stageOffsetIn(windowWidth.value)),
    stageOffsetIn,
    stageSizeIn,
    islandElement,
    /** Reads the place of the island now. A host calls it before it places the stage in a window that just changed. */
    measureIsland: islandBounds.update,
    startSurfaceDrag,
    moveSurfaceDrag,
    endSurfaceDrag,
  }
}

/** The layout of the fullscreen mode: the surface width, its drag, and the place of the stage beside the surface. */
export type FullscreenLayout = ReturnType<typeof createFullscreenLayout>

const fullscreenLayoutKey: InjectionKey<FullscreenLayout> = Symbol('fullscreen-layout')

/**
 * Creates the layout of the fullscreen mode and gives it to the overlay.
 *
 * Use when:
 * - A page hosts the fullscreen mode. It places its stage with the result.
 *
 * Returns:
 * - The layout. The overlay under this page reads the same one through {@link useFullscreenLayout}.
 */
export function provideFullscreenLayout(): FullscreenLayout {
  const layout = createFullscreenLayout()
  provide(fullscreenLayoutKey, layout)
  return layout
}

/** The layout that the page that hosts the fullscreen mode provides. */
export function useFullscreenLayout(): FullscreenLayout {
  const layout = inject(fullscreenLayoutKey)
  if (!layout)
    throw new Error('The fullscreen layout is missing. The page that hosts the fullscreen mode must provide it.')
  return layout
}
