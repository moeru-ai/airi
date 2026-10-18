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

import { AnimatedContent } from '../animations'

const props = withDefaults(defineProps<{
  align?: DropdownMenuContentProps['align']
  contentClass?: string | string[]
  disabled?: DropdownMenuTriggerProps['disabled']
  /** A non-modal menu leaves the rest of the page interactive while it is open. */
  modal?: boolean
  side?: DropdownMenuContentProps['side']
  sideOffset?: DropdownMenuContentProps['sideOffset']
  variant?: 'blurry' | 'default'
}>(), {
  align: 'start',
  contentClass: undefined,
  disabled: false,
  modal: true,
  side: 'bottom',
  sideOffset: 6,
  variant: 'default',
})

/** The open state. Bind it to open the menu from code, for example after a hover delay. */
const open = defineModel<boolean>('open', { default: false })
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
        as-child
        :align="props.align"
        :side="props.side"
        :side-offset="props.sideOffset"
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
              'border-neutral-200 bg-white text-neutral-700',
              'dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100',
            ]
            : [],
          props.contentClass,
        ]"
      >
        <AnimatedContent>
          <slot />
        </AnimatedContent>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
