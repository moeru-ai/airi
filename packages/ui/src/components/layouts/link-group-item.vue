<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'

import { Primitive } from 'reka-ui'

withDefaults(defineProps<{
  /** Element or component that the item renders as, such as `RouterLink`. Other attributes, such as `to`, pass to it. */
  as?: PrimitiveProps['as']
  /** A short note on the right, such as where the link goes. It shrinks and cuts before the name does. */
  detail?: string
}>(), {
  as: 'a',
})
</script>

<template>
  <Primitive
    :as="as"
    :class="[
      'link-group-item',
      'relative isolate overflow-hidden',
      'flex items-center gap-3',
      'rounded-lg py-2.5 pl-3 pr-2.5',
      'outline-none',
    ]"
  >
    <!-- The name keeps its width. The detail shrinks and cuts first. -->
    <span :class="['link-group-item-name', 'min-w-[4em] flex-[0_1_auto] truncate', 'text-base']">
      <slot />
    </span>
    <span
      v-if="detail || $slots.detail"
      :class="[
        'link-group-item-detail',
        'min-w-[3em] flex-[1_4_auto] truncate text-right',
        'text-[13px] leading-[18px] text-neutral-400 dark:text-neutral-500',
      ]"
    >
      <slot name="detail">{{ detail }}</slot>
    </span>
    <div
      :class="[
        'link-group-item-arrow',
        'i-solar:alt-arrow-right-linear ml-auto size-4 shrink-0',
        'text-neutral-400 dark:text-neutral-500',
      ]"
    />
  </Primitive>
</template>

<style scoped>
/* The theme color sweeps in from the left and fills the item, fading toward the right. */
.link-group-item::before {
  --at-apply: 'bg-gradient-to-r from-primary-500/20 via-primary-500/10 to-transparent dark:from-primary-400/20 dark:via-primary-400/10 dark:to-transparent';
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  width: 30%;
  opacity: 0;
  pointer-events: none;
  transition: all 0.4s ease-in-out;
}

/*
 * The dots under the item light up in the theme color. LinkGroup shifts them onto its own dot grid.
 * The dots take the text color, as the dots of LinkGroup do.
 */
.link-group-item::after {
  --at-apply: 'text-primary-300/50 dark:text-primary-200/20';
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background-image: radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0);
  background-size: 10px 10px;
  background-position: var(--link-group-dot-x, 0) var(--link-group-dot-y, 0);
  mask-image: linear-gradient(to right, white 10%, transparent 75%);
  opacity: 0;
  pointer-events: none;
  transition: all 0.4s ease-in-out;
}

.link-group-item:hover::before,
.link-group-item:focus-visible::before {
  width: 100%;
  opacity: 1;
}

.link-group-item:hover::after,
.link-group-item:focus-visible::after {
  opacity: 1;
}

/* Keyboard focus looks like hover, with an outline as well. */
.link-group-item:focus-visible {
  --at-apply: 'outline-2 outline-solid -outline-offset-2 outline-primary-300 dark:outline-primary-400/50';
}

.link-group-item-name,
.link-group-item-detail {
  transition: color 0.3s ease-in-out;
}

.link-group-item-arrow {
  opacity: 0.6;
  transition: all 0.3s ease-in-out;
}

.link-group-item:hover .link-group-item-name,
.link-group-item:focus-visible .link-group-item-name {
  --at-apply: text-primary-600 dark:text-primary-300;
}

.link-group-item:hover .link-group-item-detail,
.link-group-item:focus-visible .link-group-item-detail {
  --at-apply: text-primary-600 dark:text-primary-300;
  opacity: 0.8;
}

.link-group-item:hover .link-group-item-arrow,
.link-group-item:focus-visible .link-group-item-arrow {
  --at-apply: text-primary-500 dark:text-primary-400;
  opacity: 1;
  transform: translateX(2px);
}
</style>
