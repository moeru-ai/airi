<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from 'reka-ui'

/**
 * A compact icon button for a toolbar. Its label shows as a tooltip and names the button for assistive technology.
 * A toggle passes `pressed`, and an active toggle has the primary tint.
 *
 * Use it inside a reka-ui `TooltipProvider`, such as the one of the toolbar that holds it.
 */
// The root is the tooltip, which renders no element, so attributes such as `class` and `aria-*` go to the button.
defineOptions({ inheritAttrs: false })

defineProps<{
  icon: string
  label: string
  /** The state of a toggle. Leave it unset for a plain action. */
  pressed?: boolean
  disabled?: boolean
  /** Extra classes of the icon, for example a color. */
  iconClass?: string
  /** A longer explanation under the label in the tooltip. */
  description?: string
}>()

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <TooltipRoot>
    <TooltipTrigger as-child>
      <button
        v-bind="$attrs"
        type="button"
        :aria-label="label"
        :aria-pressed="pressed"
        :disabled="disabled"
        :class="[
          'flex size-7 shrink-0 items-center justify-center rounded-md',
          'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40',
          pressed
            ? 'bg-primary-500/15 text-primary-600 dark:text-primary-300'
            : 'text-neutral-500 hover:bg-neutral-200/70 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100',
        ]"
        @click="emit('click')"
      >
        <span :class="[icon, iconClass, 'size-4']" />
      </button>
    </TooltipTrigger>
    <TooltipPortal>
      <TooltipContent
        side="bottom"
        :side-offset="4"
        :class="[
          'z-50 rounded-md px-2 py-1 text-xs',
          'bg-neutral-900 text-neutral-100 shadow-sm dark:bg-neutral-100 dark:text-neutral-900',
        ]"
      >
        <p :class="['font-medium']">
          {{ label }}
        </p>
        <p v-if="description" :class="['max-w-56 opacity-75']">
          {{ description }}
        </p>
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>
