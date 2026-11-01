<script setup lang="ts">
import type { TooltipContentProps } from 'reka-ui'

import type { DockSize, DockVariant } from './context'

import { computed, toRef } from 'vue'

import { provideDockContext } from './context'

/**
 * A pill that holds icon buttons, such as the dock of the floating chat. Its buttons take their size, the side of their
 * tooltips, and the surface of their tooltips from it.
 */
const props = withDefaults(defineProps<{
  /** @default 'horizontal' */
  orientation?: 'horizontal' | 'vertical'
  /** @default 'sm' */
  size?: DockSize
  /**
   * The surface. `default` is opaque. `blurry` is optional: it lets the background show through, for a dock over the
   * stage.
   * @default 'default'
   */
  variant?: DockVariant
  /**
   * The opacity of a `blurry` dock and its tooltips, from 0 to 1. Dark mode uses 0.1 less, as `OverlayButton` does.
   * @default 0.8
   */
  opacity?: number
  /** The background blur of a `blurry` dock and its tooltips, in pixels. @default 12 */
  blur?: number
  /**
   * The side of the tooltips of the buttons. Pick the side that faces into the window. A button can pick its own.
   * @default 'bottom' for a horizontal dock, and 'right' for a vertical dock
   */
  tooltipSide?: TooltipContentProps['side']
  /**
   * Draws the shadow. Turn it off when a parent draws it, for example around a clipped dock.
   * @default true
   */
  shadow?: boolean
}>(), {
  orientation: 'horizontal',
  size: 'sm',
  variant: 'default',
  opacity: 0.8,
  blur: 12,
  tooltipSide: undefined,
  shadow: true,
})

provideDockContext({
  orientation: toRef(() => props.orientation),
  size: toRef(() => props.size),
  variant: toRef(() => props.variant),
  opacity: toRef(() => props.opacity),
  blur: toRef(() => props.blur),
  tooltipSide: computed(() => props.tooltipSide ?? (props.orientation === 'vertical' ? 'right' : 'bottom')),
})

// A `blurry` surface reads its opacity and blur from these variables.
const surfaceStyle = computed(() => props.variant === 'blurry'
  ? {
      '--dock-opacity': String(props.opacity),
      '--dock-dark-opacity': String(Math.max(0, props.opacity - 0.1)),
      '--dock-blur': `${props.blur}px`,
    }
  : undefined)
</script>

<template>
  <div
    :style="surfaceStyle"
    :class="[
      // The dock wraps its buttons, also in a parent that stretches its children.
      'w-fit flex items-center gap-1 rounded-full p-0.5',
      props.orientation === 'vertical' ? 'flex-col' : '',
      props.shadow ? 'shadow-md' : '',
      // A blurry dock has the fill of the other controls over the stage, such as `OverlayButton`.
      props.variant === 'blurry'
        ? [
          'bg-neutral-50/[var(--dock-opacity)] dark:bg-neutral-800/[var(--dock-dark-opacity)]',
          'backdrop-blur-[var(--dock-blur)]',
        ]
        : 'bg-white dark:bg-neutral-900',
    ]"
  >
    <slot />
  </div>
</template>
