<script setup lang="ts">
export interface UsageChartTooltip {
  /** Horizontal center of the tooltip in pixels, from the left edge of the chart. */
  left: number
  title: string
  lines: string[]
}

defineProps<{
  title: string
  value: string
  startLabel: string
  endLabel: string
  /** The point under the pointer. `null` hides the tooltip. */
  tooltip: UsageChartTooltip | null
}>()
</script>

<template>
  <section :class="['flex flex-col gap-2']">
    <header :class="['flex flex-col gap-0.5']">
      <h4 :class="['text-xs font-medium', 'text-neutral-500 dark:text-neutral-400']">
        {{ title }}
      </h4>
      <p :class="['text-2xl font-semibold tracking-tight']">
        {{ value }}
      </p>
    </header>

    <slot name="legend" />

    <div :class="['relative']">
      <slot />

      <div
        v-if="tooltip"
        :class="[
          'pointer-events-none absolute top-0 z-1 -translate-x-1/2',
          'flex flex-col gap-0.5 rounded-lg px-2.5 py-1.5 text-xs',
          'bg-white/90 text-neutral-700 shadow-md backdrop-blur',
          'dark:bg-neutral-800/90 dark:text-neutral-200',
        ]"
        :style="{ left: `${tooltip.left}px` }"
      >
        <span :class="['font-medium']">{{ tooltip.title }}</span>
        <span v-for="line in tooltip.lines" :key="line">{{ line }}</span>
      </div>
    </div>

    <div :class="['flex justify-between text-xs', 'text-neutral-500 dark:text-neutral-400']">
      <span>{{ startLabel }}</span>
      <span>{{ endLabel }}</span>
    </div>
  </section>
</template>
