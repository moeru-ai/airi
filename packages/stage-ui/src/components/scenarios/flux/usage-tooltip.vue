<script setup lang="ts">
import { computed } from 'vue'

export interface UsageTooltipContent {
  /** Anchor X, in pixels from the left of the positioned parent. Without `placement`, this is the bubble center. */
  left: number
  /** Anchor Y, in pixels from the top of that parent. */
  top?: number
  /** `left` and `right` sit beside the anchor, centered on its row. */
  placement?: 'left' | 'right'
  title: string
  lines: string[]
}

const props = defineProps<UsageTooltipContent>()

const transform = computed(() => {
  if (props.placement === 'left')
    return 'translate(calc(-100% - 6px), -50%)'
  if (props.placement === 'right')
    return 'translate(6px, -50%)'
  return 'translate(-50%)'
})
</script>

<template>
  <div
    :class="[
      'pointer-events-none absolute z-1',
      'flex flex-col gap-0.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs',
      'bg-white/90 text-neutral-700 shadow-md backdrop-blur',
      'dark:bg-neutral-800/90 dark:text-neutral-200',
    ]"
    :style="{ left: `${left}px`, top: `${top ?? 0}px`, transform }"
  >
    <span :class="['font-medium']">{{ title }}</span>
    <span v-for="line in lines" :key="line">{{ line }}</span>
  </div>
</template>
