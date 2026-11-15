<script setup lang="ts">
import type { TooltipContentProps } from 'reka-ui'

import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { computed, shallowRef, watch } from 'vue'

/**
 * A short label beside one control. It opens at once on hover, and on keyboard focus only.
 *
 * The slot holds the control. The control keeps its own accessible name, and the label only describes it.
 */
// The root renders no element, so attributes from the parent go to the control through the trigger. The trigger of
// a menu can therefore wrap this component and still reach the control.
defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  label: string
  /**
   * The preferred side before collision handling. Pick the side that faces into the window.
   * @default 'bottom'
   */
  side?: TooltipContentProps['side']
  /** @default 6 */
  sideOffset?: number
  /**
   * The surface. `default` is opaque. `blurry` lets the background show through, as the controls over the stage.
   * @default 'default'
   */
  variant?: 'default' | 'blurry'
  /**
   * The opacity of a `blurry` surface, from 0 to 1. Dark mode uses 0.1 less, as `OverlayButton` does.
   * @default 0.8
   */
  opacity?: number
  /** The background blur of a `blurry` surface, in pixels. @default 12 */
  blur?: number
  /** Closes the tooltip and keeps it closed, for example while a menu of the control is open. @default false */
  disabled?: boolean
}>(), {
  side: 'bottom',
  sideOffset: 6,
  variant: 'default',
  opacity: 0.8,
  blur: 12,
  disabled: false,
})

const open = shallowRef(false)
// Reka UI stops listening to a disabled trigger. A tooltip that is open when it turns disabled then stays open.
watch(() => props.disabled, (disabled) => {
  if (disabled)
    open.value = false
})

// A `blurry` surface reads its opacity and blur from these variables.
const surfaceStyle = computed(() => props.variant === 'blurry'
  ? {
      '--tooltip-opacity': String(props.opacity),
      '--tooltip-dark-opacity': String(Math.max(0, props.opacity - 0.1)),
      '--tooltip-blur': `${props.blur}px`,
    }
  : undefined)
</script>

<template>
  <!--
    Only keyboard focus opens the tooltip: a menu that closes gives the focus back to its control, and the tooltip
    must not come back after a click.
  -->
  <TooltipProvider :delay-duration="0" disable-hoverable-content ignore-non-keyboard-focus>
    <TooltipRoot v-model:open="open" :disabled="props.disabled">
      <TooltipTrigger as-child v-bind="$attrs">
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <Transition
          enter-active-class="transition-opacity duration-200"
          enter-from-class="opacity-0"
          leave-active-class="transition-opacity duration-200"
          leave-to-class="opacity-0"
        >
          <TooltipContent
            :side="props.side"
            :side-offset="props.sideOffset"
            :collision-padding="8"
            :style="surfaceStyle"
            :class="[
              'z-[10000] max-w-[calc(100vw-16px)] truncate rounded-full px-2.5 py-1 shadow-md',
              'text-xs font-medium text-neutral-700 dark:text-neutral-200',
              props.variant === 'blurry'
                ? [
                  'bg-neutral-50/[var(--tooltip-opacity)] dark:bg-neutral-800/[var(--tooltip-dark-opacity)]',
                  'backdrop-blur-[var(--tooltip-blur)]',
                ]
                : 'bg-white dark:bg-neutral-900',
            ]"
          >
            {{ props.label }}
          </TooltipContent>
        </Transition>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
