<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { onMounted, useTemplateRef } from 'vue'

defineProps<{
  /** The name of the group, shown small in the top-left corner. */
  title?: string
  /** An Iconify class, such as `i-solar:layers-bold-duotone`. It shows next to the title, and large and faded in the bottom-right corner. */
  icon?: string
}>()

// The dots of a hovered item sit on the dot grid of the group, so the two grids overlap.
// An item starts its dots at its own corner, so the group shifts them by the offset of the item.
// Items that come or go change the height of the group, so a size change is the time to align them again.
const group = useTemplateRef<HTMLElement>('group')
function alignDots() {
  for (const item of group.value?.querySelectorAll<HTMLElement>('.link-group-item') ?? []) {
    item.style.setProperty('--link-group-dot-x', `${-item.offsetLeft}px`)
    item.style.setProperty('--link-group-dot-y', `${-item.offsetTop}px`)
  }
}
useResizeObserver(group, alignDots)
onMounted(alignDots)

/**
 * The narrowest width at which no item cuts its text: the widest item at the natural width of its parts,
 * with the padding and the border of the group around it. A layout can use it to decide how many groups fit side by side.
 */
function naturalWidth() {
  const element = group.value
  if (!element)
    return 0
  const style = getComputedStyle(element)
  const frame = element.offsetWidth - element.clientWidth + Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
  // A part of an item can grow to fill the item, so its box is not its natural width. Its text is: a range measures the laid-out text.
  // A part without text, such as the arrow, keeps its own width.
  const range = document.createRange()
  const naturalWidthOf = (part: HTMLElement) => {
    if (!part.textContent?.trim())
      return part.offsetWidth
    range.selectNodeContents(part)
    return Math.max(range.getBoundingClientRect().width, Number.parseFloat(getComputedStyle(part).minWidth) || 0)
  }
  let widest = 0
  for (const item of element.querySelectorAll<HTMLElement>('.link-group-item')) {
    const itemStyle = getComputedStyle(item)
    const parts = [...item.children] as HTMLElement[]
    const gaps = Number.parseFloat(itemStyle.columnGap) * Math.max(0, parts.length - 1)
    const padding = Number.parseFloat(itemStyle.paddingLeft) + Number.parseFloat(itemStyle.paddingRight)
    widest = Math.max(widest, parts.reduce((sum, part) => sum + naturalWidthOf(part), 0) + gaps + padding)
  }
  range.detach()
  return Math.ceil(widest + frame)
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
/*
 * The dot texture fills the top-left corner and fades out toward the middle.
 * The dots take the text color, so a color utility sets them, theme colors included.
 */
.link-group::after {
  --at-apply: 'text-neutral-200/60 dark:text-neutral-700/25';
  content: '';
  position: absolute;
  inset: 0;
  z-index: -2;
  background-image: radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0);
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
