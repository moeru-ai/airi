<script setup lang="ts">
import type {
  DropdownMenuContentProps,
  DropdownMenuTriggerProps,
} from 'reka-ui'

import {
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
import { computed } from 'vue'

import { AnimatedContent } from '../animations'

const props = withDefaults(defineProps<{
  align?: DropdownMenuContentProps['align']
  contentClass?: string | string[]
  disabled?: DropdownMenuTriggerProps['disabled']
  /** A non-modal menu leaves the rest of the page interactive while it is open. */
  modal?: boolean
  /**
   * A point or an element that the menu opens at in place of its trigger, for example the pointer of a right click. The
   * trigger still gets the focus back when the menu closes.
   */
  reference?: DropdownMenuContentProps['reference']
  side?: DropdownMenuContentProps['side']
  sideOffset?: DropdownMenuContentProps['sideOffset']
  variant?: 'blurry' | 'default'
}>(), {
  align: 'start',
  contentClass: undefined,
  disabled: false,
  modal: true,
  reference: undefined,
  side: 'bottom',
  sideOffset: 6,
  variant: 'default',
})

const emit = defineEmits<{
  /** Fires when the closed menu returns focus to its trigger. Cancel it to move focus elsewhere, for example into a field that a menu item opened. */
  closeAutoFocus: [event: Event]
}>()

/** The open state. Bind it to open the menu from code, for example after a hover delay. */
const open = defineModel<boolean>('open', { default: false })

// NOTICE:
// reka forwards a prop to inner menu parts only when it had a value at their first render.
// The content mounts again when a reference comes, so the reference reaches the popper.
// Source: reka-ui 2.10, dist/shared/useForwardProps.js.
// Remove the key when reka forwards props that get a value later.
const contentKey = computed(() => props.reference === undefined ? 'trigger' : 'reference')
</script>

<template>
  <DropdownMenuRoot v-model:open="open" :modal="props.modal">
    <DropdownMenuTrigger
      as-child
      :disabled="props.disabled"
    >
      <slot name="trigger" />
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
        :key="contentKey"
        as-child
        :align="props.align"
        :side="props.side"
        :side-offset="props.sideOffset"
        :reference="props.reference"
        :class="[
          'z-[10000] rounded-xl border p-1 shadow-lg outline-none',
          props.variant === 'blurry'
            ? [
              'backdrop-blur-md',
              'border-neutral-100/80 bg-neutral-100/80 text-neutral-700',
              'dark:border-neutral-800/60 dark:bg-neutral-800/80 dark:text-neutral-100',
            ]
            : [],
          props.variant === 'default'
            ? [
              'border-neutral-100 bg-white text-neutral-700',
              'dark:border-neutral-700/50 dark:bg-neutral-800 dark:text-neutral-100',
            ]
            : [],
          props.contentClass,
        ]"
        @close-auto-focus="emit('closeAutoFocus', $event)"
      >
        <AnimatedContent>
          <slot />
        </AnimatedContent>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
