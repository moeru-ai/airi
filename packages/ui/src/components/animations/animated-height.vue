<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { computed, useTemplateRef } from 'vue'

const props = withDefaults(defineProps<{
  /**
   * The edge that stays in place while the height changes. Use `end` when the container grows upward,
   * for example a panel docked to the bottom of the screen.
   *
   * @default 'start'
   */
  align?: 'start' | 'end'
}>(), {
  align: 'start',
})

/**
 * A container that animates its height to the height of its content.
 *
 * Use when:
 * - The content of one container changes, for example a panel that switches between views.
 *
 * Expects:
 * - The slot content sets its own padding. The outer box clips while it resizes, so put focus rings inside the padding.
 *
 * A CSS height transition does not run between two `auto` heights, so the inner box is measured and the outer box
 * gets that height in pixels. `AnimatedContent` covers content that opens and closes instead.
 */
const inner = useTemplateRef<HTMLElement>('inner')
const { height } = useElementSize(inner, undefined, { box: 'border-box' })

// Before the first measure the height is 0. The box keeps its natural height until then.
const style = computed(() => height.value > 0 ? { height: `${height.value}px` } : undefined)
</script>

<template>
  <div
    :style="style"
    :class="[
      'flex flex-col overflow-clip',
      props.align === 'end' ? 'justify-end' : 'justify-start',
      'transition-[height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
      'motion-reduce:transition-none',
    ]"
  >
    <div ref="inner" :class="['shrink-0']">
      <slot />
    </div>
  </div>
</template>
