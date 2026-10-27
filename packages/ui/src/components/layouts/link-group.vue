<script setup lang="ts">
import type { LinkGroupItemHandle } from './link-group-context'

import { useResizeObserver } from '@vueuse/core'
import { nextTick, provide, useTemplateRef } from 'vue'

import { linkGroupContextKey } from './link-group-context'

defineProps<{
  /** The name of the group, shown small in the top-left corner. */
  title?: string
  /** An Iconify class, such as `i-solar:layers-bold-duotone`. It shows next to the title, and large and faded in the bottom-right corner. */
  icon?: string
}>()

const group = useTemplateRef<HTMLElement>('group')
const items = new Set<LinkGroupItemHandle>()

// The dots of a hovered item sit on the dot grid of the group. The group shifts them by the offset of the item,
// again when its size changes, as items come or go.
function alignDots() {
  for (const item of items) {
    const element = item.element()
    element?.style.setProperty('--link-group-dot-x', `${-element.offsetLeft}px`)
    element?.style.setProperty('--link-group-dot-y', `${-element.offsetTop}px`)
  }
}
useResizeObserver(group, alignDots)

// Many items mount in one update, so they share one alignment after it.
let alignScheduled = false
function scheduleAlign() {
  if (alignScheduled)
    return
  alignScheduled = true
  void nextTick(() => {
    alignScheduled = false
    alignDots()
  })
}

provide(linkGroupContextKey, {
  register(item) {
    items.add(item)
    scheduleAlign()
    return () => items.delete(item)
  },
})

/**
 * The narrowest width at which no item cuts its text: the widest item, with the padding and the border of the group around it.
 * A layout can use it to decide how many groups fit side by side.
 */
function naturalWidth() {
  const element = group.value
  if (!element)
    return 0
  const style = getComputedStyle(element)
  const frame = element.offsetWidth - element.clientWidth + Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
  return Math.ceil(Math.max(0, ...[...items].map(item => item.naturalWidth())) + frame)
}

defineExpose({ naturalWidth })
</script>

<template>
  <section
    ref="group"
    :aria-label="title"
    :class="[
      'link-group',
      'relative isolate overflow-hidden',
      'rounded-xl px-1.5 pb-2 pt-1.5',
      'border-2 border-solid border-neutral-100 dark:border-neutral-800/25',
      'bg-neutral-50 dark:bg-neutral-900',
    ]"
  >
    <!-- The faded icon sits in the bottom-right corner and the edge cuts it, as on the settings category cards. -->
    <div
      v-if="icon"
      :class="[
        'link-group-icon',
        'absolute -bottom-7 -right-2 -z-1 size-28',
        'text-neutral-400/50 dark:text-neutral-600/50',
        'transition-all duration-400 ease-in-out',
        icon,
      ]"
    />
    <div
      v-if="title"
      :class="[
        'flex items-center gap-1.5',
        'px-3 pb-1 pt-2',
        'text-sm text-neutral-500 dark:text-neutral-400',
      ]"
    >
      <div v-if="icon" :class="['size-4 shrink-0', 'text-neutral-400 dark:text-neutral-500', icon]" />
      {{ title }}
    </div>
    <slot />
  </section>
</template>

<style scoped>
/* The dot texture fills the top-left corner and fades out toward the middle, as on IconItem. */
.link-group::after {
  --at-apply: 'bg-dotted-[neutral-200/60] dark:bg-dotted-[neutral-700/25]';
  content: '';
  position: absolute;
  inset: 0;
  z-index: -2;
  background-size: 10px 10px;
  mask-image: linear-gradient(165deg, white 20%, transparent 40%);
}

.link-group-icon {
  opacity: 0.5;
}

/* Hover only scales the icon. It keeps its gray, so it never covers the last item in the theme color. */
.link-group:has(.link-group-item:hover) .link-group-icon,
.link-group:has(.link-group-item:focus-visible) .link-group-icon {
  scale: 1.1;
}
</style>
