<script setup lang="ts">
export interface UsageTooltipContent {
  /** Horizontal center of the tooltip in pixels, from the left edge of its positioned parent. */
  left: number
  title: string
  lines: string[]
}

defineProps<UsageTooltipContent>()
</script>

<template>
  <div
    :class="[
      'pointer-events-none absolute top-0 z-1 -translate-x-1/2',
      'flex flex-col gap-0.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs',
      'bg-white/90 text-neutral-700 shadow-md backdrop-blur',
      'dark:bg-neutral-800/90 dark:text-neutral-200',
    ]"
    :style="{ left: `${left}px` }"
  >
    <span :class="['font-medium']">{{ title }}</span>
    <span v-for="line in lines" :key="line">{{ line }}</span>
  </div>
</template>
